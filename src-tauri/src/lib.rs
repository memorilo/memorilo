pub mod db;
pub mod cmd;
pub mod setup;
pub mod error;

use tauri::Manager;
use tauri_plugin_dialog::DialogExt;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let specta_builder = setup::get_specta_builder();

    tauri::Builder::default()
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_fs::init())
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
            setup::setup_settings(app);
            setup::setup_database(app);

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            if let tauri::RunEvent::ExitRequested { api, .. } = event {
                let state = app_handle.state::<cmd::SettingsState>().clone();
                
                if let Err(e) = tauri::async_runtime::block_on(async move {
                    cmd::save_settings(state).await
                }) {
                    app_handle.dialog()
                        .message(format!("Error saving settings: {}", e))
                        .kind(tauri_plugin_dialog::MessageDialogKind::Error)
                        .title("Save Error")
                        .show(|_| {
                            std::process::exit(1);
                        });
                }
            }
        });
}
