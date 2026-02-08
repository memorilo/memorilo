use crate::error::Result;
use rusqlite::params;
use serde::{Deserialize, Serialize};

/// Represents a journal entry joined with its document metadata.
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct JournalEntry {
    pub doc_id: String,
    pub journal_at: String,
    pub journal_date: String,
    pub title: String,
    pub typ: String,
    pub doc_created_at: String,
    pub doc_updated_at: String,
}

fn journal_entry_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<JournalEntry> {
    Ok(JournalEntry {
        doc_id: row.get(0)?,
        journal_at: row.get(1)?,
        journal_date: row.get(2)?,
        title: row.get(3)?,
        typ: row.get(4)?,
        doc_created_at: row.get(5)?,
        doc_updated_at: row.get(6)?,
    })
}

/// Cursor for journal pagination (descending by journal_at, then doc_id).
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct JournalCursor {
    pub journal_at: String,
    pub doc_id: String,
}

/// Paginated journal response.
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct JournalPage {
    pub items: Vec<JournalEntry>,
    pub next_cursor: Option<JournalCursor>,
}

const DEFAULT_PAGE_SIZE: usize = 50;
const MAX_PAGE_SIZE: usize = 200;

/// Insert a new journal entry for a document.
pub fn create_journal(
    conn: &rusqlite::Connection,
    doc_id: &str,
    journal_at: &str,
) -> Result<()> {
    conn.execute(
        "INSERT INTO journals (doc_id, journal_at) VALUES (?1, datetime(?2))",
        params![doc_id, journal_at],
    )?;
    Ok(())
}

/// List journal entries with their linked document metadata (cursor pagination).
pub fn get_journals(
    conn: &rusqlite::Connection,
    cursor: Option<JournalCursor>,
    limit: Option<u32>,
) -> Result<JournalPage> {
    let mut page_size = limit.unwrap_or(DEFAULT_PAGE_SIZE as u32) as usize;
    if page_size == 0 {
        page_size = DEFAULT_PAGE_SIZE;
    }
    if page_size > MAX_PAGE_SIZE {
        page_size = MAX_PAGE_SIZE;
    }
    let fetch_size = page_size + 1;

    let mut entries = Vec::new();
    if let Some(cursor) = cursor {
        let mut stmt = conn.prepare(
            "SELECT j.doc_id, j.journal_at, date(j.journal_at, 'localtime'), d.title, d.typ, d.created_at, d.updated_at \
             FROM journals j \
             JOIN docs d ON d.doc_id = j.doc_id \
             WHERE (j.journal_at < ?1) OR (j.journal_at = ?1 AND j.doc_id < ?2) \
             ORDER BY j.journal_at DESC, j.doc_id DESC \
             LIMIT ?3",
        )?;
        let rows = stmt.query_map(
            params![cursor.journal_at, cursor.doc_id, fetch_size],
            journal_entry_from_row,
        )?;
        for row in rows {
            entries.push(row?);
        }
    } else {
        let mut stmt = conn.prepare(
            "SELECT j.doc_id, j.journal_at, date(j.journal_at, 'localtime'), d.title, d.typ, d.created_at, d.updated_at \
             FROM journals j \
             JOIN docs d ON d.doc_id = j.doc_id \
             ORDER BY j.journal_at DESC, j.doc_id DESC \
             LIMIT ?1",
        )?;
        let rows = stmt.query_map(params![fetch_size], journal_entry_from_row)?;
        for row in rows {
            entries.push(row?);
        }
    }

    let has_more = entries.len() > page_size;
    if has_more {
        entries.truncate(page_size);
    }
    let next_cursor = if has_more {
        entries.last().map(|entry| JournalCursor {
            journal_at: entry.journal_at.clone(),
            doc_id: entry.doc_id.clone(),
        })
    } else {
        None
    };

    Ok(JournalPage {
        items: entries,
        next_cursor,
    })
}

/// List journal entries within a date range (inclusive), using local dates.
pub fn get_journals_by_date_range(
    conn: &rusqlite::Connection,
    start_date: &str,
    end_date: &str,
) -> Result<Vec<JournalEntry>> {
    let (start_date, end_date) = if start_date <= end_date {
        (start_date, end_date)
    } else {
        (end_date, start_date)
    };

    let mut stmt = conn.prepare(
        "SELECT j.doc_id, j.journal_at, date(j.journal_at, 'localtime'), d.title, d.typ, d.created_at, d.updated_at \
         FROM journals j \
         JOIN docs d ON d.doc_id = j.doc_id \
         WHERE date(j.journal_at, 'localtime') BETWEEN date(?1) AND date(?2) \
         ORDER BY j.journal_at DESC, j.doc_id DESC",
    )?;

    let rows = stmt.query_map(params![start_date, end_date], journal_entry_from_row)?;

    let mut entries = Vec::new();
    for row in rows {
        entries.push(row?);
    }
    Ok(entries)
}

/// Delete a journal entry by document id.
pub fn delete_journal(conn: &rusqlite::Connection, doc_id: &str) -> Result<()> {
    conn.execute("DELETE FROM journals WHERE doc_id = ?1", params![doc_id])?;
    Ok(())
}
