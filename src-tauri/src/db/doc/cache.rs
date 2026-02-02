use super::{lock_mutex, DocResult, DocState, DOC_CACHE_CAPACITY, PinnedDoc};
use crate::utils::lru_cache::LruCache;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use yrs::Doc;

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

    /// Get a Yrs Doc from the cache by doc_id.
    /// If not in cache, returns None.
    pub fn get(&self, doc_id: &str) -> DocResult<Option<Doc>> {
        let doc = {
            let pinned = lock_mutex(&self.pinned, "DocState.pinned")?;
            pinned.get(doc_id).map(|entry| entry.doc.clone())
        };
        if doc.is_some() {
            return Ok(doc);
        }
        let mut cache = lock_mutex(&self.cache, "DocState.cache")?;
        Ok(cache.get(&doc_id.to_string()).cloned())
    }

    /// Insert a Yrs Doc into the cache.
    pub fn insert(&self, doc_id: String, doc: Doc) -> DocResult<()> {
        {
            let mut pinned = lock_mutex(&self.pinned, "DocState.pinned")?;
            if let Some(entry) = pinned.get_mut(&doc_id) {
                entry.doc = doc;
                return Ok(());
            }
        }
        let mut cache = lock_mutex(&self.cache, "DocState.cache")?;
        cache.put(doc_id, doc);
        Ok(())
    }

    /// Remove a Yrs Doc from the cache.
    pub fn remove(&self, doc_id: &str) -> DocResult<Option<Doc>> {
        let removed = {
            let mut pinned = lock_mutex(&self.pinned, "DocState.pinned")?;
            pinned.remove(doc_id).map(|entry| entry.doc)
        };
        if removed.is_some() {
            return Ok(removed);
        }
        let mut cache = lock_mutex(&self.cache, "DocState.cache")?;
        Ok(cache.remove(&doc_id.to_string()))
    }

    /// Check if a doc_id exists in the cache.
    pub fn contains(&self, doc_id: &str) -> DocResult<bool> {
        let has_pinned = {
            let pinned = lock_mutex(&self.pinned, "DocState.pinned")?;
            pinned.contains_key(doc_id)
        };
        if has_pinned {
            return Ok(true);
        }
        let cache = lock_mutex(&self.cache, "DocState.cache")?;
        Ok(cache.contains_key(&doc_id.to_string()))
    }

    /// Clear all documents from the cache.
    pub fn clear(&self) -> DocResult<()> {
        lock_mutex(&self.pinned, "DocState.pinned")?.clear();
        lock_mutex(&self.cache, "DocState.cache")?.clear();
        lock_mutex(&self.watches, "DocState.watches")?.clear();
        lock_mutex(&self.topic_syncs, "DocState.topic_syncs")?.clear();
        Ok(())
    }

    /// Get the current number of documents in the cache.
    pub fn len(&self) -> DocResult<usize> {
        let pinned_len = {
            let pinned = lock_mutex(&self.pinned, "DocState.pinned")?;
            pinned.len()
        };
        let cache_len = {
            let cache = lock_mutex(&self.cache, "DocState.cache")?;
            cache.len()
        };
        Ok(cache_len + pinned_len)
    }

    /// Check if the cache is empty.
    pub fn is_empty(&self) -> DocResult<bool> {
        let pinned_empty = {
            let pinned = lock_mutex(&self.pinned, "DocState.pinned")?;
            pinned.is_empty()
        };
        if !pinned_empty {
            return Ok(false);
        }
        let cache_empty = {
            let cache = lock_mutex(&self.cache, "DocState.cache")?;
            cache.is_empty()
        };
        Ok(cache_empty)
    }

    /// Remove a document from all in-memory caches/subscriptions.
    pub fn purge_doc(&self, doc_id: &str) -> DocResult<()> {
        lock_mutex(&self.cache, "DocState.cache")?.remove(&doc_id.to_string());
        lock_mutex(&self.pinned, "DocState.pinned")?.remove(doc_id);
        if let Some(entry) = lock_mutex(&self.topic_syncs, "DocState.topic_syncs")?.remove(doc_id) {
            entry.handle.abort();
        }

        let mut watches = lock_mutex(&self.watches, "DocState.watches")?;
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
        Ok(())
    }

    /// Pin a document to prevent LRU eviction.
    pub fn pin(&self, doc_id: &str, doc: Doc) -> DocResult<()> {
        let mut pinned = lock_mutex(&self.pinned, "DocState.pinned")?;
        if let Some(entry) = pinned.get_mut(doc_id) {
            entry.pins = entry.pins.saturating_add(1);
            entry.doc = doc;
            return Ok(());
        }

        pinned.insert(
            doc_id.to_string(),
            PinnedDoc {
                doc,
                pins: 1,
            },
        );
        drop(pinned);
        lock_mutex(&self.cache, "DocState.cache")?.remove(&doc_id.to_string());
        Ok(())
    }

    /// Unpin a document and return it to the LRU cache when no pins remain.
    pub fn unpin(&self, doc_id: &str) -> DocResult<()> {
        let mut pinned = lock_mutex(&self.pinned, "DocState.pinned")?;
        let should_release = match pinned.get_mut(doc_id) {
            Some(entry) if entry.pins > 1 => {
                entry.pins -= 1;
                false
            }
            Some(_) => true,
            None => false,
        };

        if !should_release {
            return Ok(());
        }

        let entry = pinned.remove(doc_id);
        drop(pinned);

        if let Some(entry) = entry {
            lock_mutex(&self.cache, "DocState.cache")?.put(doc_id.to_string(), entry.doc);
        }
        Ok(())
    }
}
