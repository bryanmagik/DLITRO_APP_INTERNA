mod printer_windows;
mod printer_network;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    // tauri-plugin-printer-v2 (no confundir con tauri_plugin_printer sin -v2)
    .plugin(tauri_plugin_printer_v2::init())
    .invoke_handler(tauri::generate_handler![
      printer_windows::imprimir_raw_windows,
      printer_windows::listar_impresoras_windows,
      printer_network::imprimir_raw_network,
      printer_network::probar_conexion_red,
    ])    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
