use crate::db::{self, doc::DocState, DbState};
use crate::error::{Error, Result};
use chrono::Utc;
use rusqlite::{params, OptionalExtension};
use tauri::State;
use uuid::Uuid;

fn normalize_journal_at(journal_at: &str) -> Result<String> {
    let dt = chrono::DateTime::parse_from_rfc3339(journal_at)
        .map_err(|e| Error::from(format!("Invalid journalAt (RFC3339 expected): {e}")))?;
    Ok(dt
        .with_timezone(&Utc)
        .format("%Y-%m-%d %H:%M:%S")
        .to_string())
}

#[tauri::command]
#[specta::specta]
pub async fn create_journal(
    state: State<'_, DocState>,
    db_state: State<'_, DbState>,
    journal_at: String,
    title: String,
) -> Result<String> {
    let conn = db_state.conn.lock()?;

    let journal_at = normalize_journal_at(&journal_at)?;

    // Idempotent-by-date: when a local date already has a journal, reuse it.
    // This prevents virtual-scroll re-mounts from accidentally creating duplicates.
    let existing = conn
        .query_row(
            "SELECT j.doc_id \
             FROM journals j \
             JOIN docs d ON d.doc_id = j.doc_id \
             WHERE date(j.journal_at, 'localtime') = date(?1, 'localtime') \
             ORDER BY d.updated_at DESC, j.doc_id DESC \
             LIMIT 1",
            params![journal_at],
            |row| row.get::<_, String>(0),
        )
        .optional()?;
    if let Some(doc_id) = existing {
        return Ok(doc_id);
    }

    let doc_id = Uuid::now_v7().to_string();
    log::info!("create_journal request: {doc_id}");

    state
        .create_doc(&conn, &doc_id, &title)
        .map_err(Error::from)?;
    if let Err(err) = db::create_journal(&conn, &doc_id, &journal_at) {
        let _ = state.delete_doc(&conn, &doc_id);
        log::warn!("create_journal failed, rolling back doc: {doc_id}");
        return Err(err);
    }

    Ok(doc_id)
}

#[tauri::command]
#[specta::specta]
pub async fn get_journals(
    db_state: State<'_, DbState>,
    cursor: Option<db::JournalCursor>,
    limit: Option<u32>,
) -> Result<db::JournalPage> {
    let conn = db_state.conn.lock()?;
    db::get_journals(&conn, cursor, limit)
}

#[tauri::command]
#[specta::specta]
pub async fn get_journals_by_date_range(
    db_state: State<'_, DbState>,
    start_date: String,
    end_date: String,
) -> Result<Vec<db::JournalEntry>> {
    let conn = db_state.conn.lock()?;
    db::get_journals_by_date_range(&conn, &start_date, &end_date)
}

#[tauri::command]
#[specta::specta]
pub async fn delete_journal(
    state: State<'_, DocState>,
    db_state: State<'_, DbState>,
    doc_id: String,
) -> Result<()> {
    log::info!("delete_journal request: {doc_id}");
    let conn = db_state.conn.lock()?;
    db::delete_journal(&conn, &doc_id)?;
    state.purge_doc(&doc_id).map_err(Error::from)?;
    Ok(())
}
