use std::fs;
use std::path::PathBuf;
use std::process::Command;

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

/// Evita que PowerShell abra una ventana negra (CMD) al imprimir o listar impresoras.
#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;

/// Lista todas las impresoras instaladas en Windows vía PowerShell Get-Printer.
/// Retorna JSON crudo: array de objetos { "Name": "..." } o un solo objeto.
#[tauri::command]
pub fn listar_impresoras_windows() -> Result<String, String> {
    #[cfg(not(target_os = "windows"))]
    {
        return Err("listar_impresoras_windows solo está disponible en Windows".into());
    }

    #[cfg(target_os = "windows")]
    {
        let output = Command::new("powershell")
            .creation_flags(CREATE_NO_WINDOW)
            .args([
                "-NoProfile",
                "-NonInteractive",
                "-ExecutionPolicy",
                "Bypass",
                "-Command",
                "Get-Printer | Select-Object Name | ConvertTo-Json -Compress",
            ])
            .output()
            .map_err(|e| format!("No se pudo ejecutar PowerShell: {e}"))?;

        let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();

        if !output.status.success() {
            return Err(format!(
                "Get-Printer falló (code {:?}). stderr: {stderr} stdout: {stdout}",
                output.status.code()
            ));
        }

        if stdout.is_empty() {
            return Ok("[]".into());
        }

        Ok(stdout)
    }
}

/// Imprime texto plano en la impresora térmica vía spooler RAW de Windows (WinSpool).
/// Pensado para SEWOO SLK-TS100 y similares ESC/POS.
fn imprimir_raw_windows_sync(printer: String, contenido: String) -> Result<String, String> {
    if printer.trim().is_empty() {
        return Err("Nombre de impresora vacío".into());
    }

    let temp_path: PathBuf = std::env::temp_dir().join(format!(
        "dlitro_print_{}_{}.txt",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis())
            .unwrap_or(0)
    ));

    fs::write(&temp_path, contenido.as_bytes()).map_err(|e| format!("No se pudo escribir archivo temporal: {e}"))?;

    let path_str = temp_path.to_string_lossy().replace('\'', "''");
    let printer_str = printer.replace('\'', "''");

    let script = format!(
        r#"
$ErrorActionPreference = 'Stop'
$printerName = '{printer_str}'
$filePath = '{path_str}'
$content = [System.IO.File]::ReadAllText($filePath, [System.Text.Encoding]::UTF8)
$textBytes = [System.Text.Encoding]::UTF8.GetBytes($content)
$init = [byte[]](0x1B, 0x40)
$feed = [byte[]](0x0A, 0x0A, 0x0A)
$cut = [byte[]](0x1D, 0x56, 0x00)
$all = New-Object byte[] ($init.Length + $textBytes.Length + $feed.Length + $cut.Length)
[Array]::Copy($init, 0, $all, 0, $init.Length)
[Array]::Copy($textBytes, 0, $all, $init.Length, $textBytes.Length)
[Array]::Copy($feed, 0, $all, ($init.Length + $textBytes.Length), $feed.Length)
[Array]::Copy($cut, 0, $all, ($init.Length + $textBytes.Length + $feed.Length), $cut.Length)

Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public class DlitroRawPrinter {{
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Ansi)]
    public class DOCINFOA {{
        [MarshalAs(UnmanagedType.LPStr)] public string pDocName;
        [MarshalAs(UnmanagedType.LPStr)] public string pOutputFile;
        [MarshalAs(UnmanagedType.LPStr)] public string pDataType;
    }}
    [DllImport("winspool.drv", EntryPoint="OpenPrinterA", SetLastError=true, CharSet=CharSet.Ansi)]
    public static extern bool OpenPrinter(string szPrinter, out IntPtr hPrinter, IntPtr pd);
    [DllImport("winspool.drv", SetLastError=true)]
    public static extern bool ClosePrinter(IntPtr hPrinter);
    [DllImport("winspool.drv", EntryPoint="StartDocPrinterA", SetLastError=true, CharSet=CharSet.Ansi)]
    public static extern bool StartDocPrinter(IntPtr hPrinter, int level, DOCINFOA di);
    [DllImport("winspool.drv", SetLastError=true)]
    public static extern bool EndDocPrinter(IntPtr hPrinter);
    [DllImport("winspool.drv", SetLastError=true)]
    public static extern bool StartPagePrinter(IntPtr hPrinter);
    [DllImport("winspool.drv", SetLastError=true)]
    public static extern bool EndPagePrinter(IntPtr hPrinter);
    [DllImport("winspool.drv", SetLastError=true)]
    public static extern bool WritePrinter(IntPtr hPrinter, IntPtr pBytes, int dwCount, out int dwWritten);
    public static string Send(string printer, byte[] bytes) {{
        IntPtr h;
        if (!OpenPrinter(printer, out h, IntPtr.Zero)) {{
            return "ERROR:OpenPrinter:" + (new System.ComponentModel.Win32Exception()).Message;
        }}
        try {{
            var di = new DOCINFOA {{ pDocName = "DLITRO", pDataType = "RAW" }};
            if (!StartDocPrinter(h, 1, di)) {{
                return "ERROR:StartDocPrinter:" + (new System.ComponentModel.Win32Exception()).Message;
            }}
            if (!StartPagePrinter(h)) {{
                EndDocPrinter(h);
                return "ERROR:StartPagePrinter:" + (new System.ComponentModel.Win32Exception()).Message;
            }}
            IntPtr p = Marshal.AllocCoTaskMem(bytes.Length);
            try {{
                Marshal.Copy(bytes, 0, p, bytes.Length);
                int written;
                if (!WritePrinter(h, p, bytes.Length, out written)) {{
                    return "ERROR:WritePrinter:" + (new System.ComponentModel.Win32Exception()).Message;
                }}
                EndPagePrinter(h);
                EndDocPrinter(h);
                return "OK:" + written;
            }} finally {{
                Marshal.FreeCoTaskMem(p);
            }}
        }} finally {{
            ClosePrinter(h);
        }}
    }}
}}
'@

$result = [DlitroRawPrinter]::Send($printerName, $all)
Write-Output $result
"#
    );

    let mut cmd = Command::new("powershell");
    #[cfg(target_os = "windows")]
    {
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    let output = cmd
        .args([
            "-NoProfile",
            "-NonInteractive",
            "-ExecutionPolicy",
            "Bypass",
            "-Command",
            &script,
        ])
        .output()
        .map_err(|e| format!("No se pudo ejecutar PowerShell: {e}"))?;

    let _ = fs::remove_file(&temp_path);

    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();

    if !output.status.success() {
        return Err(format!(
            "PowerShell falló (code {:?}). stderr: {stderr} stdout: {stdout}",
            output.status.code()
        ));
    }

    if stdout.starts_with("ERROR:") {
        return Err(format!("Spooler RAW: {stdout}"));
    }

    if !stdout.starts_with("OK:") {
        return Err(format!(
            "Respuesta inesperada del spooler. stderr: {stderr} stdout: {stdout}"
        ));
    }

    Ok(stdout)
}

/// Comando Tauri async: la impresión RAW corre en un hilo de fondo para no bloquear la UI.
#[tauri::command]
pub async fn imprimir_raw_windows(printer: String, contenido: String) -> Result<String, String> {
    #[cfg(not(target_os = "windows"))]
    {
        let _ = (printer, contenido);
        return Err("imprimir_raw_windows solo está disponible en Windows".into());
    }

    #[cfg(target_os = "windows")]
    {
        tauri::async_runtime::spawn_blocking(move || imprimir_raw_windows_sync(printer, contenido))
            .await
            .map_err(|e| format!("Tarea de impresión interrumpida: {e}"))?
    }
}
