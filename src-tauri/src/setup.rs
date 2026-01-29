use crate::db;
use tauri::App;
use tauri::Manager;
use tauri_specta::collect_commands;

use crate::cmd::SettingsState;

pub fn get_specta_builder() -> tauri_specta::Builder {
    let builder = tauri_specta::Builder::<tauri::Wry>::new().commands(collect_commands![
        crate::cmd::get_root_folder_uuid,
        crate::cmd::is_folder_node_exist,
        crate::cmd::get_folder_node,
        crate::cmd::get_folder_node_children,
        crate::cmd::create_folder_node,
        crate::cmd::rename_folder_node,
        crate::cmd::delete_folder_node_ret_parent,
        crate::cmd::get_parent_folder_node_uuid,
        crate::cmd::read_settings,
        crate::cmd::update_settings,
        crate::cmd::save_settings,
        crate::cmd::get_doc,
        crate::cmd::get_doc_version,
        crate::cmd::update_doc,
        crate::cmd::update_topic_doc,
        crate::cmd::get_client_id,
        crate::cmd::get_app_local_data_dir,
        crate::cmd::get_git_commit_id,
        crate::cmd::get_doc_nodes_count,
        crate::cmd::get_doc_updates_count,
        crate::cmd::create_doc,
        crate::cmd::delete_doc,
        crate::cmd::create_topic,
        crate::cmd::watch_doc,
        crate::cmd::unwatch_doc,
    ]);

    #[cfg(debug_assertions)]
    builder
        .export(
            specta_typescript::Typescript::default().header("// @ts-nocheck"),
            "../packages/api/src/native/bindings.gen.ts",
        )
        .expect("Failed to export typescript bindings");

    builder
}

pub fn setup_database(app: &App) {
    let app_data_dir = app
        .path()
        .app_local_data_dir()
        .expect("failed to get app local data dir");
    std::fs::create_dir_all(&app_data_dir).expect("failed to create app data dir");
    let db_path = app_data_dir.join("memorilo.db");
    let conn = db::get_connection(db_path.to_str().unwrap()).expect("failed to open database");
    app.manage(db::DbState {
        conn: std::sync::Arc::new(std::sync::Mutex::new(conn)),
    });
    app.manage(db::doc::DocState::new());
}

pub fn setup_settings(app: &App) {
    let app_data_dir = app
        .path()
        .app_local_data_dir()
        .expect("failed to get app local data dir");
    std::fs::create_dir_all(&app_data_dir).expect("failed to create app data dir");
    let settings_path = app_data_dir.join("settings.toml");
    app.manage(SettingsState {
        path: tokio::sync::Mutex::new(settings_path),
        value: tokio::sync::RwLock::new(None),
    });

    let state = app.state::<SettingsState>();
    tauri::async_runtime::block_on(async move { crate::cmd::read_settings(state).await })
        .expect("failed to read settings");
}
