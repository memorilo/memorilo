use crate::utils::lru_cache::LruCache;
use loro::{ExportMode, LoroDoc, ToJson, VersionVector};
use rusqlite::{params, Connection};
use serde_json::Value;
use std::collections::{HashMap, HashSet};
use std::sync::{Arc, Mutex};
use tauri::async_runtime::JoinHandle;
use tauri::ipc::Channel;
use tokio::time::{sleep, Duration};

const DOC_CACHE_CAPACITY: usize = 32;
const TOPIC_SYNC_DEBOUNCE_MS: u64 = 300;

#[derive(Debug)]
struct PinnedDoc {
    doc: LoroDoc,
    pins: usize,
}

struct WatchEntry {
    doc_id: String,
    channel: Channel<Vec<u8>>,
    last_version: VersionVector,
}

struct TopicSyncEntry {
    handle: JoinHandle<()>,
}

#[derive(Clone)]
struct DocNodePayload {
    node_name: String,
    attributes: Value,
    node_uuid: Option<String>,
    text: Option<String>,
    children: Vec<DocNodePayload>,
}

#[derive(Clone)]
struct ExistingNode {
    id: i64,
    node_uuid: Option<String>,
    parent_id: Option<i64>,
    position: i64,
    node_name: String,
    attr: String,
    text: Option<String>,
}

/// Document state manager with LRU cache for LoroDoc instances.
#[derive(Clone)]
pub struct DocState {
    /// LRU cache for LoroDoc instances, keyed by doc_id
    cache: Arc<Mutex<LruCache<String, LoroDoc>>>,
    /// Pinned docs that should not be evicted (ref-counted by watches)
    pinned: Arc<Mutex<HashMap<String, PinnedDoc>>>,
    /// Active watches keyed by watch id
    watches: Arc<Mutex<HashMap<String, WatchEntry>>>,
    /// Debounced topic sync tasks keyed by doc id
    topic_syncs: Arc<Mutex<HashMap<String, TopicSyncEntry>>>,
}

impl DocState {
    /// Create a new DocState with an LRU cache capacity of 32.
    pub fn new() -> Self {
        Self {
            cache: Arc::new(Mutex::new(LruCache::new(DOC_CACHE_CAPACITY))),
            pinned: Arc::new(Mutex::new(HashMap::new())),
            watches: Arc::new(Mutex::new(HashMap::new())),
            topic_syncs: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    /// Get a LoroDoc from the cache by doc_id.
    /// If not in cache, returns None.
    pub fn get(&self, doc_id: &str) -> Option<LoroDoc> {
        if let Some(doc) = self
            .pinned
            .lock()
            .unwrap()
            .get(doc_id)
            .map(|entry| entry.doc.clone())
        {
            return Some(doc);
        }
        let mut cache = self.cache.lock().unwrap();
        cache.get(&doc_id.to_string()).cloned()
    }

    /// Insert a LoroDoc into the cache.
    pub fn insert(&self, doc_id: String, doc: LoroDoc) {
        if let Some(entry) = self.pinned.lock().unwrap().get_mut(&doc_id) {
            entry.doc = doc;
            return;
        }
        let mut cache = self.cache.lock().unwrap();
        cache.put(doc_id, doc);
    }

    /// Remove a LoroDoc from the cache.
    pub fn remove(&self, doc_id: &str) -> Option<LoroDoc> {
        if let Some(entry) = self.pinned.lock().unwrap().remove(doc_id) {
            return Some(entry.doc);
        }
        let mut cache = self.cache.lock().unwrap();
        cache.remove(&doc_id.to_string())
    }

    /// Check if a doc_id exists in the cache.
    pub fn contains(&self, doc_id: &str) -> bool {
        if self.pinned.lock().unwrap().contains_key(doc_id) {
            return true;
        }
        let cache = self.cache.lock().unwrap();
        cache.contains_key(&doc_id.to_string())
    }

    /// Clear all documents from the cache.
    pub fn clear(&self) {
        let mut cache = self.cache.lock().unwrap();
        cache.clear();
        self.pinned.lock().unwrap().clear();
        self.watches.lock().unwrap().clear();
        self.topic_syncs.lock().unwrap().clear();
    }

    /// Get the current number of documents in the cache.
    pub fn len(&self) -> usize {
        let cache_len = self.cache.lock().unwrap().len();
        let pinned_len = self.pinned.lock().unwrap().len();
        cache_len + pinned_len
    }

    /// Check if the cache is empty.
    pub fn is_empty(&self) -> bool {
        self.cache.lock().unwrap().is_empty() && self.pinned.lock().unwrap().is_empty()
    }

    /// Load a document from the update log if not present in cache.
    pub fn get_or_load(&self, conn: &Connection, doc_id: &str) -> Result<LoroDoc, String> {
        if let Some(doc) = self.get(doc_id) {
            return Ok(doc);
        }

        log::info!("Doc cache miss, loading from db: {doc_id}");

        let mut stmt = conn
            .prepare("SELECT data FROM doc_updates WHERE doc_id = ? ORDER BY created_at ASC, id ASC")
            .map_err(|e| e.to_string())?;

        let updates = stmt
            .query_map(params![doc_id], |row| row.get::<_, Vec<u8>>(0))
            .map_err(|e| e.to_string())?;

        let doc = LoroDoc::new();
        let mut updates_count = 0usize;
        for update in updates {
            let data = update.map_err(|e| e.to_string())?;
            doc.import(&data).map_err(|e| e.to_string())?;
            updates_count += 1;
        }

        self.insert(doc_id.to_string(), doc.clone());
        log::info!("Loaded doc from db: {doc_id} (updates: {updates_count})");
        Ok(doc)
    }

    /// Create a new document and persist an initial snapshot.
    pub fn create_doc(&self, conn: &Connection, doc_id: &str) -> Result<LoroDoc, String> {
        log::info!("Creating doc: {doc_id}");
        let doc = LoroDoc::new();
        let snapshot = doc.export(ExportMode::Snapshot).map_err(|e| e.to_string())?;
        let client_id = crate::utils::client_id();
        conn.execute(
            "INSERT INTO doc_updates (doc_id, data, client_id, sync_status) VALUES (?1, ?2, ?3, 0)",
            params![doc_id, snapshot, client_id],
        )
        .map_err(|e| e.to_string())?;

        self.insert(doc_id.to_string(), doc.clone());
        log::info!("Created doc: {doc_id}");
        Ok(doc)
    }

    /// Delete a document's persisted data and purge it from memory.
    pub fn delete_doc(&self, conn: &Connection, doc_id: &str) -> Result<(), String> {
        log::info!("Deleting doc: {doc_id}");
        conn.execute("DELETE FROM doc_updates WHERE doc_id = ?1", params![doc_id])
            .map_err(|e| e.to_string())?;
        conn.execute("DELETE FROM doc_nodes WHERE doc_id = ?1", params![doc_id])
            .map_err(|e| e.to_string())?;
        self.purge_doc(doc_id);
        log::info!("Deleted doc: {doc_id}");
        Ok(())
    }

    /// Remove a document from all in-memory caches/subscriptions.
    pub fn purge_doc(&self, doc_id: &str) {
        self.cache.lock().unwrap().remove(&doc_id.to_string());
        self.pinned.lock().unwrap().remove(doc_id);
        if let Some(entry) = self.topic_syncs.lock().unwrap().remove(doc_id) {
            entry.handle.abort();
        }

        let mut watches = self.watches.lock().unwrap();
        let to_remove: Vec<String> = watches
            .iter()
            .filter_map(|(watch_id, entry)| {
                if entry.doc_id == doc_id {
                    Some(watch_id.clone())
                } else {
                    None
                }
            })
            .collect();
        for watch_id in to_remove {
            watches.remove(&watch_id);
        }
    }

    /// Pin a document to prevent LRU eviction.
    pub fn pin(&self, doc_id: &str, doc: LoroDoc) {
        let mut pinned = self.pinned.lock().unwrap();
        if let Some(entry) = pinned.get_mut(doc_id) {
            entry.pins = entry.pins.saturating_add(1);
            entry.doc = doc;
            return;
        }

        pinned.insert(
            doc_id.to_string(),
            PinnedDoc {
                doc,
                pins: 1,
            },
        );
        drop(pinned);
        self.cache.lock().unwrap().remove(&doc_id.to_string());
    }

    /// Unpin a document and return it to the LRU cache when no pins remain.
    pub fn unpin(&self, doc_id: &str) {
        let mut pinned = self.pinned.lock().unwrap();
        let should_release = match pinned.get_mut(doc_id) {
            Some(entry) if entry.pins > 1 => {
                entry.pins -= 1;
                false
            }
            Some(_) => true,
            None => false,
        };

        if !should_release {
            return;
        }

        let entry = pinned.remove(doc_id);
        drop(pinned);

        if let Some(entry) = entry {
            self.cache
                .lock()
                .unwrap()
                .put(doc_id.to_string(), entry.doc);
        }
    }

    /// Track a watch subscription by id.
    pub fn add_watch(
        &self,
        watch_id: String,
        doc_id: String,
        channel: Channel<Vec<u8>>,
        last_version: VersionVector,
    ) {
        self.watches
            .lock()
            .unwrap()
            .insert(
                watch_id,
                WatchEntry {
                    doc_id,
                    channel,
                    last_version,
                },
            );
    }

    /// Remove a watch subscription and return its doc id.
    pub fn remove_watch(&self, watch_id: &str) -> Option<String> {
        self.watches
            .lock()
            .unwrap()
            .remove(watch_id)
            .map(|entry| entry.doc_id)
    }

    /// Update a watch's version vector after it catches up.
    pub fn set_watch_version(&self, watch_id: &str, last_version: VersionVector) {
        if let Some(entry) = self.watches.lock().unwrap().get_mut(watch_id) {
            entry.last_version = last_version;
        }
    }

    /// Broadcast updates to all active watches for the document.
    pub fn broadcast_updates(&self, doc_id: &str, doc: &LoroDoc) {
        let targets: Vec<(String, Channel<Vec<u8>>, VersionVector)> = {
            let watches = self.watches.lock().unwrap();
            watches
                .iter()
                .filter_map(|(watch_id, entry)| {
                    if entry.doc_id == doc_id {
                        Some((
                            watch_id.clone(),
                            entry.channel.clone(),
                            entry.last_version.clone(),
                        ))
                    } else {
                        None
                    }
                })
                .collect()
        };

        if targets.is_empty() {
            return;
        }

        let current_version = doc.oplog_vv();
        let mut failed = Vec::new();
        let mut succeeded = Vec::new();

        for (watch_id, channel, last_version) in targets {
            if current_version == last_version {
                succeeded.push(watch_id);
                continue;
            }

            let updates = match doc.export(ExportMode::updates(&last_version)) {
                Ok(updates) => updates,
                Err(_) => continue,
            };

            if !updates.is_empty() && channel.send(updates).is_err() {
                failed.push(watch_id);
                continue;
            }

            succeeded.push(watch_id);
        }

        if !succeeded.is_empty() {
            let mut watches = self.watches.lock().unwrap();
            for watch_id in succeeded {
                if let Some(entry) = watches.get_mut(&watch_id) {
                    entry.last_version = current_version.clone();
                }
            }
        }

        let mut to_unpin = Vec::new();
        {
            let mut watches = self.watches.lock().unwrap();
            for watch_id in failed {
                if let Some(entry) = watches.remove(&watch_id) {
                    to_unpin.push(entry.doc_id);
                }
            }
        }

        for doc_id in to_unpin {
            self.unpin(&doc_id);
        }
    }

    /// Debounced sync of topic doc content into doc_nodes.
    pub fn schedule_topic_sync(&self, doc_id: String, conn: Arc<Mutex<Connection>>) {
        let mut syncs = self.topic_syncs.lock().unwrap();
        if let Some(entry) = syncs.remove(&doc_id) {
            entry.handle.abort();
        }

        let state = self.clone();
        let doc_id_for_task = doc_id.clone();
        let handle = tauri::async_runtime::spawn(async move {
            sleep(Duration::from_millis(TOPIC_SYNC_DEBOUNCE_MS)).await;
            if let Err(err) = state.sync_topic_doc_nodes(&doc_id_for_task, &conn) {
                log::warn!("Failed to sync topic doc nodes: doc_id={doc_id_for_task} err={err}");
            }
        });

        syncs.insert(doc_id, TopicSyncEntry { handle });
    }

    fn sync_topic_doc_nodes(
        &self,
        doc_id: &str,
        conn: &Arc<Mutex<Connection>>,
    ) -> Result<(), String> {
        log::info!("sync_topic_doc_nodes started: doc_id={doc_id}");
        let doc = match self.get(doc_id) {
            Some(doc) => doc,
            None => {
                let conn_guard = conn.lock().map_err(|e| e.to_string())?;
                self.get_or_load(&conn_guard, doc_id)?
            }
        };

        let json_value = doc.get_deep_value().to_json_value();
        let root_value = match extract_root_node(&json_value) {
            Some(root) => root.clone(),
            None => return Err("Missing doc root node".to_string()),
        };

        let root_node = parse_doc_node(&root_value)?;

        let mut conn_guard = conn.lock().map_err(|e| e.to_string())?;
        let tx = conn_guard.transaction().map_err(|e| e.to_string())?;
        let existing_nodes = load_existing_nodes(&tx, doc_id)?;
        let mut existing_uuid_map = build_uuid_map(&existing_nodes);
        let children_map = build_children_map(&existing_nodes);
        let existing_ids: HashSet<i64> = existing_nodes.keys().copied().collect();

        let root_id = resolve_root_id(&tx, doc_id, &root_node, &existing_nodes)?;

        let mut used_ids = HashSet::new();
        sync_node(
            &tx,
            doc_id,
            &root_node,
            Some(root_id),
            None,
            0,
            &existing_nodes,
            &children_map,
            &mut existing_uuid_map,
            &mut used_ids,
        )?;

        let unused_ids: Vec<i64> = existing_ids
            .difference(&used_ids)
            .copied()
            .collect();
        for id in unused_ids {
            tx.execute("DELETE FROM doc_nodes WHERE id = ?1", params![id])
                .map_err(|e| e.to_string())?;
        }

        tx.commit().map_err(|e| e.to_string())?;
        Ok(())
    }
}

impl Default for DocState {
    fn default() -> Self {
        Self::new()
    }
}

fn extract_root_node(value: &Value) -> Option<&Value> {
    match value {
        Value::Object(map) => {
            if let Some(doc) = map.get("doc") {
                return Some(doc);
            }
            if map.contains_key("nodeName") {
                return Some(value);
            }
            None
        }
        _ => None,
    }
}

fn parse_doc_node(value: &Value) -> Result<DocNodePayload, String> {
    match value {
        Value::String(text) => Ok(DocNodePayload {
            node_name: "text".to_string(),
            attributes: serde_json::json!({}),
            node_uuid: None,
            text: Some(text.clone()),
            children: Vec::new(),
        }),
        Value::Object(map) => {
            let node_name = map
                .get("nodeName")
                .and_then(|v| v.as_str())
                .ok_or_else(|| "Missing nodeName".to_string())?
                .to_string();
            let attributes = map
                .get("attributes")
                .cloned()
                .unwrap_or_else(|| serde_json::json!({}));
            let node_uuid = attributes
                .get("uuid")
                .and_then(|v| v.as_str())
                .map(|v| v.to_string());
            let text = map
                .get("text")
                .and_then(|v| v.as_str())
                .map(|v| v.to_string());

            let mut children = Vec::new();
            if let Some(items) = map.get("children").and_then(|v| v.as_array()) {
                for item in items {
                    match item {
                        Value::String(_) | Value::Object(_) => {
                            children.push(parse_doc_node(item)?);
                        }
                        _ => {}
                    }
                }
            }

            Ok(DocNodePayload {
                node_name,
                attributes,
                node_uuid,
                text,
                children,
            })
        }
        _ => Err("Unexpected node format".to_string()),
    }
}

fn load_existing_nodes(
    tx: &rusqlite::Transaction<'_>,
    doc_id: &str,
) -> Result<HashMap<i64, ExistingNode>, String> {
    let mut stmt = tx
        .prepare(
            "SELECT id, node_uuid, parent_id, position, node_name, attr, text FROM doc_nodes WHERE doc_id = ?1",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![doc_id], |row| {
            Ok(ExistingNode {
                id: row.get(0)?,
                node_uuid: row.get(1)?,
                parent_id: row.get(2)?,
                position: row.get(3)?,
                node_name: row.get(4)?,
                attr: row.get(5)?,
                text: row.get(6)?,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut map = HashMap::new();
    for row in rows {
        let node = row.map_err(|e| e.to_string())?;
        map.insert(node.id, node);
    }
    Ok(map)
}

fn build_uuid_map(existing: &HashMap<i64, ExistingNode>) -> HashMap<String, i64> {
    existing
        .values()
        .filter_map(|node| node.node_uuid.as_ref().map(|u| (u.clone(), node.id)))
        .collect()
}

fn build_children_map(existing: &HashMap<i64, ExistingNode>) -> HashMap<Option<i64>, Vec<i64>> {
    let mut map: HashMap<Option<i64>, Vec<i64>> = HashMap::new();
    for node in existing.values() {
        map.entry(node.parent_id).or_default().push(node.id);
    }
    for children in map.values_mut() {
        children.sort_by_key(|id| existing.get(id).map(|n| n.position).unwrap_or(0));
    }
    map
}

fn resolve_root_id(
    tx: &rusqlite::Transaction<'_>,
    doc_id: &str,
    node: &DocNodePayload,
    existing: &HashMap<i64, ExistingNode>,
) -> Result<i64, String> {
    let root = existing
        .values()
        .find(|n| n.parent_id.is_none() && n.node_name == node.node_name);
    if let Some(root) = root {
        return Ok(root.id);
    }

    insert_doc_node_row(tx, doc_id, node, None, 0)
}

#[allow(clippy::too_many_arguments)]
fn sync_node(
    tx: &rusqlite::Transaction<'_>,
    doc_id: &str,
    node: &DocNodePayload,
    existing_id: Option<i64>,
    parent_id: Option<i64>,
    position: i64,
    existing: &HashMap<i64, ExistingNode>,
    children_map: &HashMap<Option<i64>, Vec<i64>>,
    uuid_map: &mut HashMap<String, i64>,
    used_ids: &mut HashSet<i64>,
) -> Result<i64, String> {
    let attr = serde_json::to_string(&node.attributes).map_err(|e| e.to_string())?;
    let node_uuid = node.node_uuid.as_deref();
    let text = node.text.as_deref();

    let id = if let Some(id) = existing_id {
        if let Some(existing_node) = existing.get(&id) {
            let needs_update = existing_node.parent_id != parent_id
                || existing_node.position != position
                || existing_node.node_name != node.node_name
                || existing_node.attr != attr
                || existing_node.text.as_deref() != text
                || existing_node.node_uuid.as_deref() != node_uuid;
            if needs_update {
                tx.execute(
                    "UPDATE doc_nodes SET parent_id = ?1, position = ?2, node_name = ?3, attr = ?4, text = ?5, node_uuid = ?6 WHERE id = ?7",
                    params![parent_id, position, node.node_name, attr, text, node_uuid, id],
                )
                .map_err(|e| e.to_string())?;
            }
        }
        id
    } else {
        insert_doc_node_row(tx, doc_id, node, parent_id, position)?
    };

    used_ids.insert(id);
    if let Some(uuid) = &node.node_uuid {
        uuid_map.remove(uuid);
    }

    let existing_children = children_map
        .get(&Some(id))
        .cloned()
        .unwrap_or_default();
    let mut non_uuid_iter = existing_children
        .iter()
        .filter(|child_id| existing.get(child_id).and_then(|n| n.node_uuid.as_ref()).is_none())
        .copied();

    for (index, child) in node.children.iter().enumerate() {
        let child_existing_id = if let Some(uuid) = &child.node_uuid {
            uuid_map.get(uuid).copied()
        } else {
            non_uuid_iter.next()
        };
        let child_id = sync_node(
            tx,
            doc_id,
            child,
            child_existing_id,
            Some(id),
            index as i64,
            existing,
            children_map,
            uuid_map,
            used_ids,
        )?;
        used_ids.insert(child_id);
    }

    Ok(id)
}

fn insert_doc_node_row(
    tx: &rusqlite::Transaction<'_>,
    doc_id: &str,
    node: &DocNodePayload,
    parent_id: Option<i64>,
    position: i64,
) -> Result<i64, String> {
    let attr = serde_json::to_string(&node.attributes).map_err(|e| e.to_string())?;
    let node_uuid = node.node_uuid.as_deref();
    let text = node.text.as_deref();
    tx.execute(
        "INSERT INTO doc_nodes (doc_id, node_uuid, parent_id, position, node_name, attr, text) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![doc_id, node_uuid, parent_id, position, node.node_name, attr, text],
    )
    .map_err(|e| e.to_string())?;
    Ok(tx.last_insert_rowid())
}
