use crate::error::Result;
use sqlite_vec::sqlite3_vec_init;
use rusqlite::ffi::sqlite3_auto_extension;

static DATABASE_MIGRATIONS: &[&str] = &[
    include_str!("../migrations/00-init-folder.sql"),
];
static FOLDER_ROOT_UUID: &str = "00000000-0000-0000-0000-000000000000";

pub fn get_connection(url: &str) -> Result<rusqlite::Connection> {
    let mut conn = rusqlite::Connection::open(url)?;
    conn.execute_batch("PRAGMA foreign_keys = ON;")?;
    unsafe {
        sqlite3_auto_extension(Some(std::mem::transmute(sqlite3_vec_init as *const ())));
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

#[cfg(test)]
mod tests {
    use super::*;
    pub fn get_memory_connection() -> rusqlite::Connection {
        get_connection(":memory:").unwrap()
    }

    #[test]
    pub fn test_database() {
        let conn = get_memory_connection();
        conn.query_one("SELECT name FROM folder_nodes WHERE uuid = ?;", [FOLDER_ROOT_UUID], |r| {
            let name: String = r.get(0)?;
            assert_eq!(name, "<ROOT>");
            Ok(())
        }).unwrap();
    }



}