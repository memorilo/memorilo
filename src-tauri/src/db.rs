mod folder;
pub mod doc;

use sqlite_vec::sqlite3_vec_init;
use rusqlite::ffi::sqlite3_auto_extension;
use crate::error::Result;

pub use folder::*;

pub struct DbState {
    pub conn: std::sync::Arc<std::sync::Mutex<rusqlite::Connection>>,
}

static DATABASE_MIGRATIONS: &[&str] = &[
    include_str!("../migrations/00-init-folder.sql"),
    include_str!("../migrations/01-note-struct.sql")
];

/// Establishes a connection to the SQLite database at the specified URL.
///
/// This function also initializes the `sqlite-vec` extension, sets up foreign keys,
/// creates the `versions` table if it doesn't exist, and applies any pending migrations.
pub fn get_connection(url: &str) -> Result<rusqlite::Connection> {
    let mut conn = rusqlite::Connection::open(url)?;
    conn.execute_batch("PRAGMA foreign_keys = ON;")?;
    unsafe {
        type SqliteExtensionInit = unsafe extern "C" fn(
            *mut rusqlite::ffi::sqlite3,
            *mut *mut i8,
            *const rusqlite::ffi::sqlite3_api_routines,
        ) -> i32;
        let init_fn =
            std::mem::transmute::<*const (), SqliteExtensionInit>(sqlite3_vec_init as *const ());
        sqlite3_auto_extension(Some(init_fn));
    }

    conn.execute("
        CREATE TABLE IF NOT EXISTS versions (
            version INTEGER PRIMARY KEY,
            applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
    ", ())?;
    let local_db_version = conn.query_one("SELECT MAX(version) FROM versions;", (), |r| {
        let version: Option<i64> = r.get::<_, Option<i64>>(0)?;
        Ok(version)
    })?.unwrap_or(-1);
    log::info!("Current database version: {}", local_db_version);
    {
        let tx = conn.transaction()?;
        for (i, migration) in DATABASE_MIGRATIONS.iter().enumerate() {
            let version = i as i64;
            if version > local_db_version {
                log::info!("Applying migration version {}...", version);
                tx.execute_batch(migration)?;
                tx.execute(
                    "INSERT INTO versions (version) VALUES (?);",
                    [version],
                )?;
            }
        }
        tx.commit()?;
    }
    Ok(conn)
}
