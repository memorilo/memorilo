use crate::error::Result;
use rusqlite::{params, OptionalExtension};
use serde::{Deserialize, Serialize};

/// Represents an asset stored in the local assets directory.
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct Asset {
    pub asset_id: String,
    pub filename: String,
    pub sha256: String,
    pub client_id: String,
    pub created_at: String,
    pub meta: Option<String>,
}

/// Insert a new asset record.
pub fn create_asset_record(
    conn: &rusqlite::Connection,
    asset_id: &str,
    filename: &str,
    sha256: &str,
    meta: Option<&str>,
) -> Result<()> {
    let client_id = crate::utils::client_id();
    conn.execute(
        "INSERT INTO assets (asset_id, filename, sha256, client_id, meta) VALUES (?1, ?2, ?3, ?4, ?5)",
        params![asset_id, filename, sha256, client_id, meta],
    )?;
    Ok(())
}

/// Retrieve an asset by its id.
pub fn get_asset_by_id(conn: &rusqlite::Connection, asset_id: &str) -> Result<Option<Asset>> {
    conn.query_row(
        "SELECT asset_id, filename, sha256, client_id, created_at, meta FROM assets WHERE asset_id = ?1",
        [asset_id],
        |row| {
            Ok(Asset {
                asset_id: row.get(0)?,
                filename: row.get(1)?,
                sha256: row.get(2)?,
                client_id: row.get(3)?,
                created_at: row.get(4)?,
                meta: row.get(5)?,
            })
        },
    )
    .optional()
    .map_err(Into::into)
}

/// Retrieve an asset by its stored filename.
pub fn get_asset_by_filename(conn: &rusqlite::Connection, filename: &str) -> Result<Option<Asset>> {
    conn.query_row(
        "SELECT asset_id, filename, sha256, client_id, created_at, meta FROM assets WHERE filename = ?1",
        [filename],
        |row| {
            Ok(Asset {
                asset_id: row.get(0)?,
                filename: row.get(1)?,
                sha256: row.get(2)?,
                client_id: row.get(3)?,
                created_at: row.get(4)?,
                meta: row.get(5)?,
            })
        },
    )
    .optional()
    .map_err(Into::into)
}

/// Retrieve assets that match a given SHA256.
pub fn get_assets_by_sha256(conn: &rusqlite::Connection, sha256: &str) -> Result<Vec<Asset>> {
    let mut stmt = conn.prepare(
        "SELECT asset_id, filename, sha256, client_id, created_at, meta FROM assets WHERE sha256 = ?1",
    )?;

    let rows = stmt.query_map([sha256], |row| {
        Ok(Asset {
            asset_id: row.get(0)?,
            filename: row.get(1)?,
            sha256: row.get(2)?,
            client_id: row.get(3)?,
            created_at: row.get(4)?,
            meta: row.get(5)?,
        })
    })?;

    let mut assets = Vec::new();
    for row in rows {
        assets.push(row?);
    }
    Ok(assets)
}

/// Delete an asset record by id.
pub fn delete_asset(conn: &rusqlite::Connection, asset_id: &str) -> Result<()> {
    conn.execute("DELETE FROM assets WHERE asset_id = ?1", [asset_id])?;
    Ok(())
}

/// List all asset ids and filenames.
pub fn list_asset_refs(conn: &rusqlite::Connection) -> Result<Vec<(String, String)>> {
    let mut stmt = conn.prepare("SELECT asset_id, filename FROM assets")?;
    let rows = stmt.query_map([], |row| Ok((row.get(0)?, row.get(1)?)))?;

    let mut refs = Vec::new();
    for row in rows {
        refs.push(row?);
    }
    Ok(refs)
}
