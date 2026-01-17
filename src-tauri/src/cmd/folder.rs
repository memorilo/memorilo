use crate::db;
use crate::error::Result;
use tauri::State;

/// Return the UUID of the root folder.
///
/// This returns a static string slice representing the application's root
/// folder UUID.
#[specta::specta]
#[tauri::command]
pub fn get_root_folder_uuid() -> &'static str {
    db::get_root_folder_uuid()
}

/// Check whether a folder node exists by UUID.
///
/// Arguments:
/// - `state`: Shared database state provided by Tauri.
/// - `uuid`: The UUID of the folder node to check.
///
/// Returns `Ok(true)` if the folder node exists, `Ok(false)` if not,
/// or an error on failure.
#[specta::specta]
#[tauri::command]
pub fn is_folder_node_exist(state: State<'_, db::DbState>, uuid: String) -> Result<bool> {
    let conn = state.conn.lock().unwrap();
    db::is_folder_node_exist(&conn, &uuid)
}

/// Retrieve a folder node by UUID.
///
/// Arguments:
/// - `state`: Shared database state provided by Tauri.
/// - `uuid`: The UUID of the folder node to retrieve.
///
/// Returns the `FolderNode` on success or an error if not found.
#[specta::specta]
#[tauri::command]
pub fn get_folder_node(state: State<'_, db::DbState>, uuid: String) -> Result<db::FolderNode> {
    let conn = state.conn.lock().unwrap();
    db::get_folder_node(&conn, &uuid)
}

/// Get immediate children of a folder node.
///
/// Arguments:
/// - `state`: Shared database state provided by Tauri.
/// - `parent_uuid`: UUID of the parent folder node.
///
/// Returns a vector of `FolderNode` representing the children.
#[specta::specta]
#[tauri::command]
pub fn get_folder_node_children(state: State<'_, db::DbState>, parent_uuid: String) -> Result<Vec<db::FolderNode>> {
    let conn = state.conn.lock().unwrap();
    db::get_folder_node_children(&conn, &parent_uuid)
}

/// Create a new folder node.
///
/// Arguments:
/// - `state`: Shared database state provided by Tauri.
/// - `parent_uuid`: UUID of the parent folder under which to create the node.
/// - `uuid`: UUID for the new folder node.
/// - `typ`: The `FolderNodeType` describing the node type.
/// - `name`: Display name for the folder node.
/// - `reference`: Optional reference string associated with the node.
///
/// Returns `Ok(())` on success or an error on failure.
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

/// Rename an existing folder node.
///
/// Arguments:
/// - `state`: Shared database state provided by Tauri.
/// - `uuid`: UUID of the folder node to rename.
/// - `new_name`: The new display name for the node.
///
/// Returns `Ok(())` on success or an error on failure.
#[specta::specta]
#[tauri::command]
pub fn rename_folder_node(state: State<'_, db::DbState>, uuid: String, new_name: String) -> Result<()> {
    let conn = state.conn.lock().unwrap();
    db::rename_folder_node(&conn, &uuid, &new_name)
}

/// Delete a folder node and return its parent's UUID.
///
/// Arguments:
/// - `state`: Shared database state provided by Tauri.
/// - `uuid`: UUID of the folder node to delete.
///
/// Returns `Ok(Some(parent_uuid))` if the deleted node had a parent,
/// `Ok(None)` if it had no parent, or an error on failure.
#[specta::specta]
#[tauri::command]
pub fn delete_folder_node_ret_parent(state: State<'_, db::DbState>, uuid: String) -> Result<Option<String>> {
    let mut conn = state.conn.lock().unwrap();
    let parent = db::get_parent_folder_node_uuid(&conn, &uuid)?;
    db::delete_folder_node(&mut conn, &uuid)?;
    Ok(parent)
}

/// Get the parent folder node UUID for a given child UUID.
///
/// Arguments:
/// - `state`: Shared database state provided by Tauri.
/// - `child_uuid`: UUID of the child node to query.
///
/// Returns `Ok(Some(parent_uuid))` if the parent exists, `Ok(None)` if the
/// node has no parent, or an error on failure.
#[specta::specta]
#[tauri::command]
pub fn get_parent_folder_node_uuid(state: State<'_, db::DbState>, child_uuid: &str) -> Result<Option<String>> {
    let conn = state.conn.lock().unwrap();
    db::get_parent_folder_node_uuid(&conn, child_uuid)
}
