use crate::db::DbState;
use crate::error::{Error, Result};
use crate::utils::client_id;
use tauri::{AppHandle, Manager, State};

#[tauri::command]
#[specta::specta]
pub fn get_client_id() -> String {
    client_id()
}

#[tauri::command]
#[specta::specta]
pub fn get_app_local_data_dir(app: AppHandle) -> Result<String> {
    let app_local_data_dir = app
        .path()
        .app_local_data_dir()
        .map_err(Error::from)?
        .to_string_lossy()
        .to_string();
    Ok(app_local_data_dir)
}

#[tauri::command]
#[specta::specta]
pub fn get_git_commit_id() -> String {
    git_version::git_version!(args = ["--always", "--dirty", "--abbrev=7"]).to_string()
}

#[tauri::command]
#[specta::specta]
pub fn get_doc_nodes_count(db_state: State<'_, DbState>) -> Result<String> {
    let conn = db_state.conn.lock()?;
    let count: i64 = conn.query_row("SELECT COUNT(*) FROM doc_nodes", (), |row| row.get(0))?;
    Ok(count.to_string())
}

#[tauri::command]
#[specta::specta]
pub fn get_doc_updates_count(db_state: State<'_, DbState>) -> Result<String> {
    let conn = db_state.conn.lock()?;
    let count: i64 = conn.query_row("SELECT COUNT(*) FROM doc_updates", (), |row| row.get(0))?;
    Ok(count.to_string())
}
