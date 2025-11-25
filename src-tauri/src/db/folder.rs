use crate::error::Result;
use serde::{Deserialize, Serialize};
use std::str::FromStr;
use rusqlite::types::{FromSql, FromSqlError, FromSqlResult, ToSql, ToSqlOutput, ValueRef};

/// Represents the type of a folder node in the hierarchy.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum FolderNodeType {
    Folder,
    Topic,
    Highlight,
    Item,
}

impl ToString for FolderNodeType {
    fn to_string(&self) -> String {
        match self {
            FolderNodeType::Folder => "folder".to_string(),
            FolderNodeType::Topic => "topic".to_string(),
            FolderNodeType::Highlight => "highlight".to_string(),
            FolderNodeType::Item => "item".to_string(),
        }
    }
}

#[derive(Debug)]
pub struct ParseFolderNodeTypeError(String);

impl std::fmt::Display for ParseFolderNodeTypeError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.0)
    }
}

impl std::error::Error for ParseFolderNodeTypeError {}

impl FromStr for FolderNodeType {
    type Err = ParseFolderNodeTypeError;
    fn from_str(s: &str) -> std::result::Result<Self, Self::Err> {
        match s {
            "folder" => Ok(FolderNodeType::Folder),
            "topic" => Ok(FolderNodeType::Topic),
            "highlight" => Ok(FolderNodeType::Highlight),
            "item" => Ok(FolderNodeType::Item),
            _ => Err(ParseFolderNodeTypeError(format!("Invalid FolderNodeType: {}", s))),
        }
    }
}

impl FromSql for FolderNodeType {
    fn column_result(value: ValueRef<'_>) -> FromSqlResult<Self> {
        value.as_str().and_then(|s| {
            Self::from_str(s).map_err(|e| FromSqlError::Other(Box::new(e)))
        })
    }
}

impl ToSql for FolderNodeType {
    fn to_sql(&self) -> rusqlite::Result<ToSqlOutput<'_>> {
        Ok(ToSqlOutput::from(self.to_string()))
    }
}

/// Represents a folder node with all its properties.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FolderNode {
    pub uuid: String,
    pub typ: FolderNodeType,
    pub name: String,
    #[serde(rename = "ref")]
    pub reference: Option<String>,
    pub created_at: String,
    pub children_updated_at: String,
}

static FOLDER_ROOT_UUID: &str = "00000000-0000-0000-0000-000000000000";

/// Returns the UUID of the root folder node.
pub fn get_folder_root_uuid() -> &'static str {
    FOLDER_ROOT_UUID
}

/// Checks if a folder node with the given UUID exists in the database.
pub fn is_folder_node_exist(conn: &rusqlite::Connection, uuid: &str) -> Result<bool> {
    let count: i64 = conn.query_one(
        "SELECT COUNT(1) FROM folder_nodes WHERE uuid = ?;",
        [uuid],
        |r| {
            let count: i64 = r.get(0)?;
            Ok(count)
        },
    )?;
    Ok(count > 0)
}

/// Retrieves a folder node by its UUID.
pub fn get_folder_node(conn: &rusqlite::Connection, uuid: &str) -> Result<FolderNode> {
    conn.query_row(
        "SELECT uuid, typ, name, ref, created_at, children_updated_at FROM folder_nodes WHERE uuid = ?",
        [uuid],
        |row| {
            Ok(FolderNode {
                uuid: row.get(0)?,
                typ: row.get(1)?,
                name: row.get(2)?,
                reference: row.get(3)?,
                created_at: row.get(4)?,
                children_updated_at: row.get(5)?,
            })
        }
    ).map_err(Into::into)
}

/// Retrieves all children of a folder node.
pub fn get_folder_node_children(conn: &rusqlite::Connection, parent_uuid: &str) -> Result<Vec<FolderNode>> {
    let mut stmt = conn.prepare(
        "SELECT n.uuid, n.typ, n.name, n.ref, n.created_at, n.children_updated_at 
         FROM folder_nodes n
         JOIN folder_node_hierarchy h ON n.uuid = h.child_uuid
         WHERE h.parent_uuid = ?"
    )?;
    
    let rows = stmt.query_map([parent_uuid], |row| {
        Ok(FolderNode {
            uuid: row.get(0)?,
            typ: row.get(1)?,
            name: row.get(2)?,
            reference: row.get(3)?,
            created_at: row.get(4)?,
            children_updated_at: row.get(5)?,
        })
    })?;

    let mut children = Vec::new();
    for row in rows {
        children.push(row?);
    }
    Ok(children)
}

/// Creates a new folder node and adds it to the hierarchy under the specified parent.
///
/// This function performs two operations within a transaction:
/// 1. Inserts the node into `folder_nodes`.
/// 2. Inserts the relationship into `folder_node_hierarchy`.
pub fn create_folder_node(
    conn: &mut rusqlite::Connection,
    parent_uuid: &str,
    uuid: &str,
    typ: FolderNodeType,
    name: &str,
    reference: Option<&str>,
) -> Result<()> {
    let tx = conn.transaction()?;
    tx.execute(
        "INSERT INTO folder_nodes (uuid, typ, name, ref) VALUES (?, ?, ?, ?)",
        (uuid, typ, name, reference),
    )?;
    tx.execute(
        "INSERT INTO folder_node_hierarchy (parent_uuid, child_uuid) VALUES (?, ?)",
        (parent_uuid, uuid),
    )?;
    tx.commit()?;
    Ok(())
}

/// Renames an existing folder node.
pub fn rename_folder_node(conn: &rusqlite::Connection, uuid: &str, new_name: &str) -> Result<()> {
    conn.execute(
        "UPDATE folder_nodes SET name = ? WHERE uuid = ?",
        (new_name, uuid),
    )?;
    Ok(())
}

/// Deletes a folder node and all its descendants.
///
/// This function recursively finds all descendant nodes and deletes them along with the target node
/// to maintain referential integrity and clean up the hierarchy.
pub fn delete_folder_node(conn: &mut rusqlite::Connection, uuid: &str) -> Result<()> {
    let tx = conn.transaction()?;
    {
        let mut stmt = tx.prepare(
            "WITH RECURSIVE descendants(id) AS (
                SELECT child_uuid FROM folder_node_hierarchy WHERE parent_uuid = ?
                UNION ALL
                SELECT h.child_uuid FROM folder_node_hierarchy h
                JOIN descendants d ON h.parent_uuid = d.id
            )
            SELECT id FROM descendants",
        )?;
        let descendants: Vec<String> = stmt.query_map([uuid], |row| row.get(0))?
            .collect::<std::result::Result<Vec<String>, _>>()?;
        
        for desc_uuid in descendants {
            tx.execute("DELETE FROM folder_nodes WHERE uuid = ?", [&desc_uuid])?;
        }
        tx.execute("DELETE FROM folder_nodes WHERE uuid = ?", [uuid])?;
    }
    tx.commit()?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use crate::db::get_connection;

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

    #[test]
    pub fn test_folder_operations() {
        let mut conn = get_memory_connection();
        let root = get_folder_root_uuid();
        
        // Create
        let folder_uuid = "11111111-1111-1111-1111-111111111111";
        create_folder_node(&mut conn, root, folder_uuid, FolderNodeType::Folder, "My Folder", None).unwrap();
        assert!(is_folder_node_exist(&conn, folder_uuid).unwrap());
        
        // Rename
        rename_folder_node(&conn, folder_uuid, "My Folder Renamed").unwrap();
        conn.query_row("SELECT name FROM folder_nodes WHERE uuid = ?", [folder_uuid], |r| {
            let name: String = r.get(0)?;
            assert_eq!(name, "My Folder Renamed");
            Ok(())
        }).unwrap();
        
        // Create child
        let child_uuid = "22222222-2222-2222-2222-222222222222";
        create_folder_node(&mut conn, folder_uuid, child_uuid, FolderNodeType::Topic, "My Topic", Some("ref-topic")).unwrap();
        assert!(is_folder_node_exist(&conn, child_uuid).unwrap());
        
        // Delete parent (should delete child)
        delete_folder_node(&mut conn, folder_uuid).unwrap();
        assert!(!is_folder_node_exist(&conn, folder_uuid).unwrap());
        assert!(!is_folder_node_exist(&conn, child_uuid).unwrap());
    }

    #[test]
    pub fn test_folder_query() {
        let mut conn = get_memory_connection();
        let root = get_folder_root_uuid();
        
        let folder_uuid = "11111111-1111-1111-1111-111111111111";
        create_folder_node(&mut conn, root, folder_uuid, FolderNodeType::Folder, "My Folder", None).unwrap();
        
        let child1_uuid = "22222222-2222-2222-2222-222222222222";
        create_folder_node(&mut conn, folder_uuid, child1_uuid, FolderNodeType::Topic, "Topic 1", Some("ref-topic")).unwrap();
        
        let child2_uuid = "33333333-3333-3333-3333-333333333333";
        create_folder_node(&mut conn, folder_uuid, child2_uuid, FolderNodeType::Topic, "Topic 2", Some("ref-topic-2")).unwrap();

        // Test get_folder_node
        let node = get_folder_node(&conn, folder_uuid).unwrap();
        assert_eq!(node.uuid, folder_uuid);
        assert_eq!(node.name, "My Folder");
        assert_eq!(node.typ, FolderNodeType::Folder);

        // Test get_folder_node_children
        let children = get_folder_node_children(&conn, folder_uuid).unwrap();
        assert_eq!(children.len(), 2);
        
        let child1 = children.iter().find(|c| c.uuid == child1_uuid).unwrap();
        assert_eq!(child1.name, "Topic 1");
        assert_eq!(child1.typ, FolderNodeType::Topic);
        
        let child2 = children.iter().find(|c| c.uuid == child2_uuid).unwrap();
        assert_eq!(child2.name, "Topic 2");
        assert_eq!(child2.typ, FolderNodeType::Topic);
    }

    #[test]
    pub fn test_folder_hierarchy_constraints() {
        let mut conn = get_memory_connection();
        let root = get_root_folder_uuid();

        // 1. Folder -> Folder
        let folder1_uuid = "10000000-0000-0000-0000-000000000001";
        create_folder_node(&mut conn, root, folder1_uuid, FolderNodeType::Folder, "Folder 1", None).unwrap();

        // 2. Folder -> Topic
        let topic1_uuid = "20000000-0000-0000-0000-000000000001";
        create_folder_node(&mut conn, folder1_uuid, topic1_uuid, FolderNodeType::Topic, "Topic 1", Some("ref-topic")).unwrap();

        // 3. Topic -> Item
        let item1_uuid = "30000000-0000-0000-0000-000000000001";
        create_folder_node(&mut conn, topic1_uuid, item1_uuid, FolderNodeType::Item, "Item 1", Some("ref-item")).unwrap();

        // 4. Topic -> Highlight
        let highlight1_uuid = "40000000-0000-0000-0000-000000000001";
        create_folder_node(&mut conn, topic1_uuid, highlight1_uuid, FolderNodeType::Highlight, "Highlight 1", Some("ref-hl")).unwrap();

        // 5. Highlight -> Item
        let item2_uuid = "30000000-0000-0000-0000-000000000002";
        create_folder_node(&mut conn, highlight1_uuid, item2_uuid, FolderNodeType::Item, "Item 2", Some("ref-item-2")).unwrap();

        // 6. Highlight -> Highlight
        let highlight2_uuid = "40000000-0000-0000-0000-000000000002";
        create_folder_node(&mut conn, highlight1_uuid, highlight2_uuid, FolderNodeType::Highlight, "Highlight 2", Some("ref-hl-2")).unwrap();

        // 7. Item -> Item
        let item3_uuid = "30000000-0000-0000-0000-000000000003";
        create_folder_node(&mut conn, item1_uuid, item3_uuid, FolderNodeType::Item, "Item 3", Some("ref-item-3")).unwrap();

        // Invalid relationships (should fail)
        
        // Folder -> Item (Invalid)
        let invalid_item_uuid = "90000000-0000-0000-0000-000000000001";
        let res = create_folder_node(&mut conn, folder1_uuid, invalid_item_uuid, FolderNodeType::Item, "Invalid Item", Some("ref"));
        assert!(res.is_err());

        // Topic -> Folder (Invalid)
        let invalid_folder_uuid = "90000000-0000-0000-0000-000000000002";
        let res = create_folder_node(&mut conn, topic1_uuid, invalid_folder_uuid, FolderNodeType::Folder, "Invalid Folder", None);
        assert!(res.is_err());
    }
}