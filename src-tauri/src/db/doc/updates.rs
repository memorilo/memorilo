use super::{DocError, DocResult, DocState};
use rusqlite::{params, Connection};
use yrs::updates::decoder::Decode;
use yrs::{Doc, ReadTxn, StateVector, Transact, Update};

impl DocState {
    /// Load a document from the update log if not present in cache.
    pub fn get_or_load(&self, conn: &Connection, doc_id: &str) -> DocResult<Doc> {
        if let Some(doc) = self.get(doc_id)? {
            return Ok(doc);
        }

        log::info!("Doc cache miss, loading from db: {doc_id}");

        let mut stmt = conn
            .prepare("SELECT data FROM doc_updates WHERE doc_id = ? ORDER BY created_at ASC, id ASC")
            .map_err(|e| DocError::Db {
                context: "prepare doc_updates select",
                source: e,
            })?;

        let updates = stmt
            .query_map(params![doc_id], |row| row.get::<_, Vec<u8>>(0))
            .map_err(|e| DocError::Db {
                context: "query doc_updates rows",
                source: e,
            })?;

        let doc = Doc::new();
        let mut updates_count = 0usize;
        {
            let mut txn = doc.transact_mut();
            for update in updates {
                let data = update.map_err(|e| DocError::Db {
                    context: "read doc_updates row",
                    source: e,
                })?;
                let update = Update::decode_v1(&data).map_err(|e| DocError::CrdtDecode {
                    context: "decode update",
                    source: e,
                })?;
                txn.apply_update(update).map_err(|e| DocError::CrdtUpdate {
                    context: "apply update",
                    source: e,
                })?;
                updates_count += 1;
            }
        }

        self.insert(doc_id.to_string(), doc.clone())?;
        log::info!("Loaded doc from db: {doc_id} (updates: {updates_count})");
        Ok(doc)
    }

    /// Create a new document and persist an initial snapshot.
    pub fn create_doc(&self, conn: &Connection, doc_id: &str, title: &str) -> DocResult<Doc> {
        log::info!("Creating doc: {doc_id}");
        conn.execute(
            "INSERT INTO docs (doc_id, title, typ) VALUES (?1, ?2, ?3)",
            params![doc_id, title, "outline"],
        )
        .map_err(|e| DocError::Db {
            context: "insert docs row",
            source: e,
        })?;
        let doc = Doc::new();
        let snapshot = doc
            .transact()
            .encode_state_as_update_v1(&StateVector::default());
        let client_id = crate::utils::client_id();
        conn.execute(
            "INSERT INTO doc_updates (doc_id, data, client_id, sync_status) VALUES (?1, ?2, ?3, 0)",
            params![doc_id, snapshot, client_id],
        )
        .map_err(|e| DocError::Db {
            context: "insert doc_updates initial snapshot",
            source: e,
        })?;

        self.insert(doc_id.to_string(), doc.clone())?;
        log::info!("Created doc: {doc_id}");
        Ok(doc)
    }

    /// Delete a document's persisted data and purge it from memory.
    pub fn delete_doc(&self, conn: &Connection, doc_id: &str) -> DocResult<()> {
        log::info!("Deleting doc: {doc_id}");
        conn.execute("DELETE FROM docs WHERE doc_id = ?1", params![doc_id])
            .map_err(|e| DocError::Db {
                context: "delete docs by doc_id",
                source: e,
            })?;
        self.purge_doc(doc_id)?;
        log::info!("Deleted doc: {doc_id}");
        Ok(())
    }
}
