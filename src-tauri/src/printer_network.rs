use tokio::io::AsyncWriteExt;
use tokio::net::TcpStream;

async fn conectar(ip: &str, port: u16) -> Result<TcpStream, String> {
    let addr = format!("{ip}:{port}");
    TcpStream::connect(&addr)
        .await
        .map_err(|e| format!("No se pudo conectar a la impresora {addr}: {e}"))
}

/// Verifica que la impresora de red responda en el puerto TCP (9100 por defecto ESC/POS).
#[tauri::command]
pub async fn probar_conexion_red(ip: String, port: u16) -> Result<(), String> {
    if ip.trim().is_empty() {
        return Err("Ingresá la IP de la impresora".into());
    }
    let _stream = conectar(ip.trim(), port).await?;
    Ok(())
}

/// Envía bytes ESC/POS directamente por TCP/IP (sin spooler de Windows).
#[tauri::command]
pub async fn imprimir_raw_network(ip: String, port: u16, data: Vec<u8>) -> Result<(), String> {
    if ip.trim().is_empty() {
        return Err("IP de impresora vacía".into());
    }
    if data.is_empty() {
        return Err("No hay datos para imprimir".into());
    }

    let addr = format!("{}:{}", ip.trim(), port);
    let mut stream = conectar(ip.trim(), port).await?;

    stream
        .write_all(&data)
        .await
        .map_err(|e| format!("Error al enviar datos a la impresora {addr}: {e}"))?;

    stream.flush().await.map_err(|e| e.to_string())?;

    Ok(())
}
