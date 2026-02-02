use super::nodes::{yjs_doc_to_doc_node, DocNodePayload};
use super::{lock_mutex, DocError, DocResult, DocState, TopicSyncEntry, TOPIC_SYNC_DEBOUNCE_MS};
use rusqlite::{params, Connection};
use std::collections::{HashMap, HashSet};
use std::sync::{Arc, Mutex};
use tokio::time::{sleep, Duration};

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

impl DocState {
    /// Debounced sync of topic doc content into doc_nodes.
    pub fn schedule_topic_sync<F>(
        &self,
        doc_id: String,
        conn: Arc<Mutex<Connection>>,
        on_error: F,
    ) -> DocResult<()>
    where
        F: Fn(DocError) + Send + Sync + 'static,
    {
        let mut syncs = match lock_mutex(&self.topic_syncs, "DocState.topic_syncs") {
            Ok(guard) => guard,
            Err(_) => {
                let context = "DocState.topic_syncs";
                let err = DocError::LockPoison { context };
                on_error(DocError::LockPoison { context });
                return Err(err);
            }
        };
        if let Some(entry) = syncs.remove(&doc_id) {
            entry.handle.abort();
        }

        let state = self.clone();
        let doc_id_for_task = doc_id.clone();
        let handle = tauri::async_runtime::spawn(async move {
            sleep(Duration::from_millis(TOPIC_SYNC_DEBOUNCE_MS)).await;
            if let Err(err) = state.sync_topic_doc_nodes(&doc_id_for_task, &conn) {
                log::error!("Failed to sync topic doc nodes: doc_id={doc_id_for_task} err={err}");
                on_error(err);
            }
        });

        syncs.insert(doc_id, TopicSyncEntry { handle });
        Ok(())
    }

    fn sync_topic_doc_nodes(
        &self,
        doc_id: &str,
        conn: &Arc<Mutex<Connection>>,
    ) -> DocResult<()> {
        log::info!("sync_topic_doc_nodes started: doc_id={doc_id}");
        let doc = match self.get(doc_id)? {
            Some(doc) => doc,
            None => {
                let conn_guard = lock_mutex(conn, "DbState.conn")?;
                self.get_or_load(&conn_guard, doc_id)?
            }
        };

        let root_node = yjs_doc_to_doc_node(&doc)?;

        let mut conn_guard = lock_mutex(conn, "DbState.conn")?;
        let tx = conn_guard
            .transaction()
            .map_err(|e| DocError::Db {
                context: "begin doc_nodes sync transaction",
                source: e,
            })?;
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
                .map_err(|e| DocError::Db {
                    context: "delete stale doc_nodes",
                    source: e,
                })?;
        }

        tx.commit().map_err(|e| DocError::Db {
            context: "commit doc_nodes sync transaction",
            source: e,
        })?;
        Ok(())
    }
}

fn load_existing_nodes(
    tx: &rusqlite::Transaction<'_>,
    doc_id: &str,
) -> DocResult<HashMap<i64, ExistingNode>> {
    let mut stmt = tx
        .prepare(
            "SELECT id, node_uuid, parent_id, position, node_name, attr, text FROM doc_nodes WHERE doc_id = ?1",
        )
        .map_err(|e| DocError::Db {
            context: "prepare doc_nodes select",
            source: e,
        })?;
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
        .map_err(|e| DocError::Db {
            context: "query doc_nodes rows",
            source: e,
        })?;

    let mut map = HashMap::new();
    for row in rows {
        let node = row.map_err(|e| DocError::Db {
            context: "read doc_nodes row",
            source: e,
        })?;
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
) -> DocResult<i64> {
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
) -> DocResult<i64> {
    let attr = node.attr.as_str();
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
                .map_err(|e| DocError::Db {
                    context: "update doc_nodes row",
                    source: e,
                })?;
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
) -> DocResult<i64> {
    let attr = node.attr.as_str();
    let node_uuid = node.node_uuid.as_deref();
    let text = node.text.as_deref();
    tx.execute(
        "INSERT INTO doc_nodes (doc_id, node_uuid, parent_id, position, node_name, attr, text) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![doc_id, node_uuid, parent_id, position, node.node_name, attr, text],
    )
    .map_err(|e| DocError::Db {
        context: "insert doc_nodes row",
        source: e,
    })?;
    Ok(tx.last_insert_rowid())
}
