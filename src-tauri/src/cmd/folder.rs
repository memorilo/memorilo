use crate::db;
use crate::error::Result;
use tauri::State;

#[specta::specta]
#[tauri::command]
pub fn get_root_folder_uuid() -> &'static str {
    db::get_root_folder_uuid()
}

#[specta::specta]
#[tauri::command]
pub fn is_folder_node_exist(state: State<'_, db::DbState>, uuid: String) -> Result<bool> {
    let conn = state.conn.lock().unwrap();
    db::is_folder_node_exist(&conn, &uuid)
}

#[specta::specta]
#[tauri::command]
pub fn get_folder_node(state: State<'_, db::DbState>, uuid: String) -> Result<db::FolderNode> {
    let conn = state.conn.lock().unwrap();
    db::get_folder_node(&conn, &uuid)
}

#[specta::specta]
#[tauri::command]
pub fn get_folder_node_children(state: State<'_, db::DbState>, parent_uuid: String) -> Result<Vec<db::FolderNode>> {
    let conn = state.conn.lock().unwrap();
    db::get_folder_node_children(&conn, &parent_uuid)
}

#[specta::specta]
#[tauri::command]
pub fn create_folder_node(
    state: State<'_, db::DbState>,
    parent_uuid: String,
    uuid: String,
    typ: db::FolderNodeType,
    name: String,
    reference: Option<String>,
) -> Result<()> {
    let mut conn = state.conn.lock().unwrap();
    db::create_folder_node(&mut conn, &parent_uuid, &uuid, typ, &name, reference.as_deref())
}

#[specta::specta]
#[tauri::command]
pub fn rename_folder_node(state: State<'_, db::DbState>, uuid: String, new_name: String) -> Result<()> {
    let conn = state.conn.lock().unwrap();
    db::rename_folder_node(&conn, &uuid, &new_name)
}

#[specta::specta]
#[tauri::command]
pub fn delete_folder_node(state: State<'_, db::DbState>, uuid: String) -> Result<()> {
    let mut conn = state.conn.lock().unwrap();
    db::delete_folder_node(&mut conn, &uuid)
}

