use crate::db::{self, doc::DocState, DbState, FolderNodeType};
use crate::error::{Error, Result};
use loro::ExportMode;
use serde::Serialize;
use tauri::{ipc::Channel, State};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct CreatedTopic {
    pub doc_id: String,
    pub topic_uuid: String,
}

#[derive(Debug, Clone, Serialize, specta::Type)]
#[specta(rename = "VersionVector", transparent)]
#[serde(transparent)]
pub struct VersionVectorDto(pub std::collections::HashMap<String, i32>);

#[tauri::command]
#[specta::specta]
pub async fn get_doc(
    state: State<'_, DocState>,
    db_state: State<'_, DbState>,
    doc_id: String,
) -> Result<Vec<u8>> {
    log::info!("get_doc request: {doc_id}");
    let conn = db_state.conn.lock()?;
    let doc = state.get_or_load(&conn, &doc_id).map_err(Error::from)?;
    Ok(doc.export(ExportMode::Snapshot)?)
}

#[tauri::command]
#[specta::specta]
pub async fn get_doc_version(
    state: State<'_, DocState>,
    db_state: State<'_, DbState>,
    doc_id: String,
) -> Result<VersionVectorDto> {
    log::info!("get_doc_version request: {doc_id}");
    let conn = db_state.conn.lock()?;
    let doc = state.get_or_load(&conn, &doc_id).map_err(Error::from)?;

    let vv = doc.oplog_vv();
    let map = vv
        .iter()
        .map(|(peer, counter)| (peer.to_string(), *counter))
        .collect();
    Ok(VersionVectorDto(map))
}

#[tauri::command]
#[specta::specta]
pub async fn update_doc(
    state: State<'_, DocState>,
    db_state: State<'_, DbState>,
    doc_id: String,
    update: Vec<u8>,
) -> Result<()> {
    log::info!("update_doc request: {doc_id} (bytes: {})", update.len());
    let doc = {
        let conn = db_state.conn.lock()?;
        state.get_or_load(&conn, &doc_id).map_err(Error::from)?
    };

    doc.import(&update)?;

    {
        let conn = db_state.conn.lock()?;
        let client_id = db::doc::client_id();
        conn.execute(
            "INSERT INTO doc_updates (doc_id, data, client_id, sync_status) VALUES (?1, ?2, ?3, 0)",
            rusqlite::params![&doc_id, &update, client_id],
        )?;
    }

    state.broadcast_updates(&doc_id, &doc);

    Ok(())
}

#[tauri::command]
#[specta::specta]
pub async fn create_doc(
    state: State<'_, DocState>,
    db_state: State<'_, DbState>,
) -> Result<String> {
    let doc_id = Uuid::now_v7().to_string();
    log::info!("create_doc request: {doc_id}");
    let _doc = {
        let conn = db_state.conn.lock()?;
        state.create_doc(&conn, &doc_id).map_err(Error::from)?
    };
    Ok(doc_id)
}

#[tauri::command]
#[specta::specta]
pub async fn delete_doc(
    state: State<'_, DocState>,
    db_state: State<'_, DbState>,
    doc_id: String,
) -> Result<()> {
    log::info!("delete_doc request: {doc_id}");
    let conn = db_state.conn.lock()?;
    state.delete_doc(&conn, &doc_id).map_err(Error::from)?;
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub async fn create_topic(
    state: State<'_, DocState>,
    db_state: State<'_, DbState>,
    parent_uuid: String,
    name: String,
) -> Result<CreatedTopic> {
    let doc_id = Uuid::now_v7().to_string();
    let topic_uuid = Uuid::now_v7().to_string();
    log::info!(
        "create_topic request: doc_id={doc_id} topic_uuid={topic_uuid} parent_uuid={parent_uuid}"
    );
    let _doc = {
        let mut conn = db_state.conn.lock()?;
        let doc = state.create_doc(&conn, &doc_id).map_err(Error::from)?;
        if let Err(err) = db::create_folder_node(
            &mut conn,
            &parent_uuid,
            &topic_uuid,
            FolderNodeType::Topic,
            &name,
            Some(&doc_id),
        ) {
            let _ = state.delete_doc(&conn, &doc_id);
            log::warn!("create_topic failed, rolling back doc: {doc_id}");
            return Err(err);
        }
        doc
    };

    Ok(CreatedTopic { doc_id, topic_uuid })
}

#[tauri::command]
#[specta::specta]
pub async fn watch_doc(
    state: State<'_, DocState>,
    db_state: State<'_, DbState>,
    doc_id: String,
    channel: Channel<Vec<u8>>,
) -> Result<String> {
    log::info!("watch_doc request: {doc_id}");
    let conn = db_state.conn.lock()?;
    let doc = state.get_or_load(&conn, &doc_id).map_err(Error::from)?;
    state.pin(&doc_id, doc.clone());

    let snapshot = doc.export(ExportMode::Snapshot)?;
    log::info!(
        "watch_doc sending full snapshot: doc_id={doc_id} bytes={}",
        snapshot.len()
    );
    if let Err(err) = channel.send(snapshot) {
        state.unpin(&doc_id);
        return Err(err.into());
    }
    let snapshot_version = doc.oplog_vv();

    let watch_id = Uuid::now_v7().to_string();
    log::info!("watch_doc established: doc_id={doc_id} watch_id={watch_id}");

    let doc_id_for_watch = doc_id.clone();
    state.add_watch(
        watch_id.clone(),
        doc_id_for_watch,
        channel.clone(),
        snapshot_version.clone(),
    );

    let current_version = doc.oplog_vv();
    if current_version != snapshot_version {
        let updates = doc.export(ExportMode::updates(&snapshot_version))?;
        if !updates.is_empty() {
            if let Err(err) = channel.send(updates) {
                state.remove_watch(&watch_id);
                state.unpin(&doc_id);
                return Err(err.into());
            }
        }
        state.set_watch_version(&watch_id, current_version);
    }

    Ok(watch_id)
}

#[tauri::command]
#[specta::specta]
pub async fn unwatch_doc(state: State<'_, DocState>, watch_id: String) -> Result<()> {
    if let Some(doc_id) = state.remove_watch(&watch_id) {
        log::info!("unwatch_doc: doc_id={doc_id} watch_id={watch_id}");
        state.unpin(&doc_id);
        return Ok(());
    }

    log::warn!("unwatch_doc: watch id not found: {watch_id}");
    Err(Error::from("watch id not found".to_string()))
}
