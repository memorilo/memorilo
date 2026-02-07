use crate::utils::lru_cache::LruCache;
use rusqlite::{params, Connection};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use tauri::async_runtime::JoinHandle;
use tauri::ipc::Channel;
use thiserror::Error as ThisError;
use yrs::{Doc, StateVector};

mod cache;
mod nodes;
mod sync;
mod updates;
mod watches;

const DOC_CACHE_CAPACITY: usize = 32;
const TOPIC_SYNC_DEBOUNCE_MS: u64 = 300;
pub type DocResult<T> = std::result::Result<T, DocError>;

#[derive(Debug, ThisError)]
pub enum DocError {
    #[error("state lock poisoned: {context}")]
    LockPoison { context: &'static str },
    #[error("database error during {context}: {source}")]
    Db {
        context: &'static str,
        #[source]
        source: rusqlite::Error,
    },
    #[error("CRDT decode error during {context}: {source}")]
    CrdtDecode {
        context: &'static str,
        #[source]
        source: yrs::encoding::read::Error,
    },
    #[error("CRDT update error during {context}: {source}")]
    CrdtUpdate {
        context: &'static str,
        #[source]
        source: yrs::error::UpdateError,
    },
}

fn lock_mutex<'a, T>(
    mutex: &'a Mutex<T>,
    context: &'static str,
) -> DocResult<std::sync::MutexGuard<'a, T>> {
    mutex.lock().map_err(|_| {
        log::error!("Mutex poisoned: {context}");
        DocError::LockPoison { context }
    })
}

#[derive(Debug)]
struct PinnedDoc {
    doc: Doc,
    pins: usize,
}

struct WatchEntry {
    doc_id: String,
    channel: Channel<Vec<u8>>,
    last_version: StateVector,
}

struct TopicSyncEntry {
    handle: JoinHandle<()>,
}

/// Document state manager with LRU cache for Yrs Doc instances.
#[derive(Clone)]
pub struct DocState {
    /// LRU cache for Yrs Doc instances, keyed by doc_id
    cache: Arc<Mutex<LruCache<String, Doc>>>,
    /// Pinned docs that should not be evicted (ref-counted by watches)
    pinned: Arc<Mutex<HashMap<String, PinnedDoc>>>,
    /// Active watches keyed by watch id
    watches: Arc<Mutex<HashMap<String, WatchEntry>>>,
    /// Debounced topic sync tasks keyed by doc id
    topic_syncs: Arc<Mutex<HashMap<String, TopicSyncEntry>>>,
}
impl Default for DocState {
    fn default() -> Self {
        Self::new()
    }
}

impl DocState {
    pub fn get_doc_title(&self, conn: &Connection, doc_id: &str) -> DocResult<String> {
        conn.query_row(
            "SELECT title FROM docs WHERE doc_id = ?1",
            params![doc_id],
            |row| row.get(0),
        )
        .map_err(|e| DocError::Db {
            context: "get docs title",
            source: e,
        })
    }

    pub fn update_doc_title(
        &self,
        conn: &Connection,
        doc_id: &str,
        title: &str,
    ) -> DocResult<()> {
        conn.execute(
            "UPDATE docs SET title = ?1, updated_at = CURRENT_TIMESTAMP WHERE doc_id = ?2",
            params![title, doc_id],
        )
        .map_err(|e| DocError::Db {
            context: "update docs title",
            source: e,
        })?;
        Ok(())
    }
}
