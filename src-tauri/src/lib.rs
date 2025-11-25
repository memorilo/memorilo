pub mod db;
pub mod cmd;
pub mod setup;
pub mod error;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let specta_builder = setup::get_specta_builder();

    tauri::Builder::default()
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(
            tauri_plugin_log::Builder::new()
                .clear_targets()
                .target(tauri_plugin_log::Target::new(
                    tauri_plugin_log::TargetKind::Stdout,
                ))
                .target(tauri_plugin_log::Target::new(
                    tauri_plugin_log::TargetKind::Webview,
                ))
                .target(tauri_plugin_log::Target::new(
                    tauri_plugin_log::TargetKind::LogDir { file_name: None },
                ))
                .max_file_size(50_000)
                .filter(|metadata| {
                    !metadata
                        .target()
                        .starts_with("tao::platform_impl::platform")
                })
                .build(),
        )
        .invoke_handler(specta_builder.invoke_handler())
        .setup(move |app| {
            specta_builder.mount_events(app);

            use tauri::Manager;
            let app_data_dir = app.path().app_local_data_dir().expect("failed to get app local data dir");
            std::fs::create_dir_all(&app_data_dir).expect("failed to create app data dir");
            let db_path = app_data_dir.join("memorilo.db");
            let conn = db::get_connection(db_path.to_str().unwrap()).expect("failed to open database");
            app.manage(db::DbState {
                conn: std::sync::Mutex::new(conn),
            });

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
