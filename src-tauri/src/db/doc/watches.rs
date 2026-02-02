use super::{lock_mutex, DocResult, DocState, WatchEntry};
use tauri::ipc::Channel;
use yrs::{Doc, ReadTxn, StateVector, Transact};

impl DocState {
    /// Track a watch subscription by id.
    pub fn add_watch(
        &self,
        watch_id: String,
        doc_id: String,
        channel: Channel<Vec<u8>>,
        last_version: StateVector,
    ) -> DocResult<()> {
        lock_mutex(&self.watches, "DocState.watches")?.insert(
            watch_id,
            WatchEntry {
                doc_id,
                channel,
                last_version,
            },
        );
        Ok(())
    }

    /// Remove a watch subscription and return its doc id.
    pub fn remove_watch(&self, watch_id: &str) -> DocResult<Option<String>> {
        let removed = lock_mutex(&self.watches, "DocState.watches")?.remove(watch_id);
        Ok(removed.map(|entry| entry.doc_id))
    }

    /// Update a watch's version vector after it catches up.
    pub fn set_watch_version(&self, watch_id: &str, last_version: StateVector) -> DocResult<()> {
        if let Some(entry) = lock_mutex(&self.watches, "DocState.watches")?.get_mut(watch_id) {
            entry.last_version = last_version;
        }
        Ok(())
    }

    /// Broadcast updates to all active watches for the document.
    pub fn broadcast_updates(&self, doc_id: &str, doc: &Doc) -> DocResult<()> {
        let targets: Vec<(String, Channel<Vec<u8>>, StateVector)> = {
            let watches = lock_mutex(&self.watches, "DocState.watches")?;
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
            return Ok(());
        }

        let txn = doc.transact();
        let current_version = txn.state_vector();
        let mut failed = Vec::new();
        let mut succeeded = Vec::new();

        for (watch_id, channel, last_version) in targets {
            if current_version == last_version {
                succeeded.push(watch_id);
                continue;
            }

            let updates = txn.encode_diff_v1(&last_version);

            if !updates.is_empty() && channel.send(updates).is_err() {
                failed.push(watch_id);
                continue;
            }

            succeeded.push(watch_id);
        }

        if !succeeded.is_empty() {
            let mut watches = lock_mutex(&self.watches, "DocState.watches")?;
            for watch_id in succeeded {
                if let Some(entry) = watches.get_mut(&watch_id) {
                    entry.last_version = current_version.clone();
                }
            }
        }

        let mut to_unpin = Vec::new();
        {
            let mut watches = lock_mutex(&self.watches, "DocState.watches")?;
            for watch_id in failed {
                if let Some(entry) = watches.remove(&watch_id) {
                    to_unpin.push(entry.doc_id);
                }
            }
        }

        for doc_id in to_unpin {
            self.unpin(&doc_id)?;
        }
        Ok(())
    }
}
