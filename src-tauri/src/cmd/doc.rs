use crate::db::{self, doc::{DocError, DocResult, DocState}, DbState, FolderNodeType};
use crate::cmd::{show_toast, ToastEvent, ToastType};
use crate::error::{Error, Result};
use crate::utils::client_id;
use serde::Serialize;
use std::collections::HashMap;
use tauri::{ipc::Channel, AppHandle, State};
use uuid::Uuid;
use yrs::updates::decoder::Decode;
use yrs::updates::encoder::Encode;
use yrs::{ReadTxn, StateVector, Transact, Update};

#[derive(Debug, Clone, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct CreatedTopic {
    pub doc_id: String,
    pub topic_uuid: String,
}

#[derive(Debug, Clone, Serialize, specta::Type)]
#[specta(rename = "StateVector", transparent)]
#[serde(transparent)]
pub struct StateVectorDto(pub Vec<u8>);

fn map_doc<T>(result: DocResult<T>) -> Result<T> {
    result.map_err(Error::from)
}

fn toast_for_doc_error(doc_id: &str, err: DocError) -> ToastEvent {
    let mut values = HashMap::new();
    values.insert("doc_id".to_string(), doc_id.to_string());
    let (i18n_key, values) = match err {
        DocError::LockPoison { context } => {
            values.insert("context".to_string(), context.to_string());
            ("rs.doc.lock_poison".to_string(), values)
        }
        DocError::Db { context, source } => {
            values.insert("context".to_string(), context.to_string());
            values.insert("error".to_string(), source.to_string());
            ("rs.doc.db".to_string(), values)
        }
        DocError::CrdtDecode { context, source } => {
            values.insert("context".to_string(), context.to_string());
            values.insert("error".to_string(), source.to_string());
            ("rs.doc.crdt_decode".to_string(), values)
        }
        DocError::CrdtUpdate { context, source } => {
            values.insert("context".to_string(), context.to_string());
            values.insert("error".to_string(), source.to_string());
            ("rs.doc.crdt_update".to_string(), values)
        }
    };
    ToastEvent {
        toast_type: ToastType::Error,
        ns: "errors".to_string(),
        i18n_key,
        values,
    }
}

#[tauri::command]
#[specta::specta]
pub async fn get_doc(
    state: State<'_, DocState>,
    db_state: State<'_, DbState>,
    doc_id: String,
) -> Result<Vec<u8>> {
    log::info!("get_doc request: {doc_id}");
    let conn = db_state.conn.lock()?;
    let doc = map_doc(state.get_or_load(&conn, &doc_id))?;
    let update = doc
        .transact()
        .encode_state_as_update_v1(&StateVector::default());
    Ok(update)
}

#[tauri::command]
#[specta::specta]
pub async fn get_doc_title(
    state: State<'_, DocState>,
    db_state: State<'_, DbState>,
    doc_id: String,
) -> Result<String> {
    let conn = db_state.conn.lock()?;
    map_doc(state.get_doc_title(&conn, &doc_id))
}

#[tauri::command]
#[specta::specta]
pub async fn get_doc_version(
    state: State<'_, DocState>,
    db_state: State<'_, DbState>,
    doc_id: String,
) -> Result<StateVectorDto> {
    let conn = db_state.conn.lock()?;
    let doc = map_doc(state.get_or_load(&conn, &doc_id))?;
    let state_vector = doc.transact().state_vector().encode_v1();
    Ok(StateVectorDto(state_vector))
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
        map_doc(state.get_or_load(&conn, &doc_id))?
    };

    let update_decoded = Update::decode_v1(&update)?;
    doc.transact_mut().apply_update(update_decoded)?;

    {
        let conn = db_state.conn.lock()?;
        let client_id = client_id();
        conn.execute(
            "INSERT INTO doc_updates (doc_id, data, client_id, sync_status) VALUES (?1, ?2, ?3, 0)",
            rusqlite::params![&doc_id, &update, client_id],
        )?;
    }

    map_doc(state.broadcast_updates(&doc_id, &doc))?;

    Ok(())
}

#[tauri::command]
#[specta::specta]
pub async fn update_topic_doc(
    state: State<'_, DocState>,
    db_state: State<'_, DbState>,
    app_handle: AppHandle,
    doc_id: String,
    update: Vec<u8>,
) -> Result<()> {
    update_doc(state.clone(), db_state.clone(), doc_id.clone(), update).await?;
    let doc_id_for_toast = doc_id.clone();
    let app_handle_for_error = app_handle.clone();
    let on_error = move |err| {
        show_toast(
            &app_handle_for_error,
            toast_for_doc_error(&doc_id_for_toast, err),
        );
    };
    map_doc(state.schedule_topic_sync(doc_id, db_state.conn.clone(), on_error))?;
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
        map_doc(state.create_doc(&conn, &doc_id, ""))?
    };
    Ok(doc_id)
}

#[tauri::command]
#[specta::specta]
pub async fn update_doc_title(
    state: State<'_, DocState>,
    db_state: State<'_, DbState>,
    doc_id: String,
    title: String,
) -> Result<()> {
    log::info!("update_doc_title request: {doc_id}");
    let conn = db_state.conn.lock()?;
    map_doc(state.update_doc_title(&conn, &doc_id, &title))?;
    Ok(())
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
    map_doc(state.delete_doc(&conn, &doc_id))?;
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
        let doc = map_doc(state.create_doc(&conn, &doc_id, &name))?;
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
    let doc = map_doc(state.get_or_load(&conn, &doc_id))?;
    map_doc(state.pin(&doc_id, doc.clone()))?;

    let snapshot = doc
        .transact()
        .encode_state_as_update_v1(&StateVector::default());
    log::info!(
        "watch_doc sending full snapshot: doc_id={doc_id} bytes={}",
        snapshot.len()
    );
    if let Err(err) = channel.send(snapshot) {
        map_doc(state.unpin(&doc_id))?;
        return Err(err.into());
    }
    let snapshot_version = doc.transact().state_vector();

    let watch_id = Uuid::now_v7().to_string();
    log::info!("watch_doc established: doc_id={doc_id} watch_id={watch_id}");

    let doc_id_for_watch = doc_id.clone();
    map_doc(state.add_watch(
            watch_id.clone(),
            doc_id_for_watch,
            channel.clone(),
            snapshot_version.clone(),
        ))?;

    let current_version = doc.transact().state_vector();
    if current_version != snapshot_version {
        let updates = doc.transact().encode_diff_v1(&snapshot_version);
        if !updates.is_empty() {
            if let Err(err) = channel.send(updates) {
                map_doc(state.remove_watch(&watch_id))?;
                map_doc(state.unpin(&doc_id))?;
                return Err(err.into());
            }
        }
        map_doc(state.set_watch_version(&watch_id, current_version))?;
    }

    Ok(watch_id)
}

#[tauri::command]
#[specta::specta]
pub async fn unwatch_doc(state: State<'_, DocState>, watch_id: String) -> Result<()> {
    if let Some(doc_id) = map_doc(state.remove_watch(&watch_id))? {
        log::info!("unwatch_doc: doc_id={doc_id} watch_id={watch_id}");
        map_doc(state.unpin(&doc_id))?;
        return Ok(());
    }

    log::warn!("unwatch_doc: watch id not found: {watch_id}");
    Err(Error::from("watch id not found".to_string()))
}
