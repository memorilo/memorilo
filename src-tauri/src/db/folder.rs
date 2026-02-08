use crate::error::Result;
use serde::{Deserialize, Serialize};
use std::str::FromStr;
use rusqlite::{OptionalExtension, types::{FromSql, FromSqlError, FromSqlResult, ToSql, ToSqlOutput, ValueRef}};

/// Represents the type of a folder node in the hierarchy.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
pub enum FolderNodeType {
    Folder,
    Topic,
    Highlight,
    Item,
}

impl std::fmt::Display for FolderNodeType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let value = match self {
            FolderNodeType::Folder => "folder",
            FolderNodeType::Topic => "topic",
            FolderNodeType::Highlight => "highlight",
            FolderNodeType::Item => "item",
        };
        f.write_str(value)
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
#[derive(Debug, Clone, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct FolderNode {
    pub uuid: String,
    pub typ: FolderNodeType,
    pub name: String,
    #[serde(rename = "ref")]
    pub reference: Option<String>,
    pub created_at: String,
    pub children_updated_at: String,
    pub has_children: bool,
}

static FOLDER_ROOT_UUID: &str = "00000000-0000-0000-0000-000000000000";

/// Returns the UUID of the root folder node.
pub fn get_root_folder_uuid() -> &'static str {
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
        "SELECT uuid, typ, name, ref, created_at, children_updated_at, 
        (SELECT COUNT(1) > 0 FROM folder_nodes child WHERE child.parent_uuid = folder_nodes.uuid) as has_children 
        FROM folder_nodes WHERE uuid = ?",
        [uuid],
        |row| {
            Ok(FolderNode {
                uuid: row.get(0)?,
                typ: row.get(1)?,
                name: row.get(2)?,
                reference: row.get(3)?,
                created_at: row.get(4)?,
                children_updated_at: row.get(5)?,
                has_children: row.get(6)?,
            })
        }
    ).map_err(Into::into)
}

/// Retrieves all children of a folder node.
pub fn get_folder_node_children(conn: &rusqlite::Connection, parent_uuid: &str) -> Result<Vec<FolderNode>> {
    let mut stmt = conn.prepare(
        "SELECT n.uuid, n.typ, n.name, n.ref, n.created_at, n.children_updated_at,
         (SELECT COUNT(1) > 0 FROM folder_nodes child WHERE child.parent_uuid = n.uuid) as has_children
         FROM folder_nodes n
         WHERE n.parent_uuid = ?"
    )?;
    
    let rows = stmt.query_map([parent_uuid], |row| {
        Ok(FolderNode {
            uuid: row.get(0)?,
            typ: row.get(1)?,
            name: row.get(2)?,
            reference: row.get(3)?,
            created_at: row.get(4)?,
            children_updated_at: row.get(5)?,
            has_children: row.get(6)?,
        })
    })?;

    let mut children = Vec::new();
    for row in rows {
        children.push(row?);
    }
    Ok(children)
}

pub fn get_parent_folder_node_uuid(conn: &rusqlite::Connection, child_uuid: &str) -> Result<Option<String>> {
    let mut stmt = conn.prepare(
        "SELECT parent_uuid FROM folder_nodes WHERE uuid = ?"
    )?;
    
    let parent_uuid: Option<String> = stmt
        .query_row([child_uuid], |row| row.get::<_, Option<String>>(0))
        .optional()?
        .flatten();
    Ok(parent_uuid)
}


/// Creates a new folder node and adds it to the hierarchy under the specified parent.
///
/// This function performs two operations within a transaction:
/// 1. Inserts the node into `folder_nodes`.
/// 2. Links the node to its parent via `parent_uuid`.
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
        "INSERT INTO folder_nodes (uuid, parent_uuid, typ, name, ref) VALUES (?, ?, ?, ?, ?)",
        (uuid, parent_uuid, typ, name, reference),
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
                SELECT uuid FROM folder_nodes WHERE parent_uuid = ?
                UNION ALL
                SELECT f.uuid FROM folder_nodes f
                JOIN descendants d ON f.parent_uuid = d.id
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

    fn insert_doc(conn: &rusqlite::Connection, doc_id: &str, title: &str) {
        conn.execute(
            "INSERT INTO docs (doc_id, title, typ) VALUES (?1, ?2, 'outline')",
            (doc_id, title),
        )
        .unwrap();
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
        let root = get_root_folder_uuid();
        
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
        insert_doc(&conn, "ref-topic", "My Topic");
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
        let root = get_root_folder_uuid();
        
        let folder_uuid = "11111111-1111-1111-1111-111111111111";
        create_folder_node(&mut conn, root, folder_uuid, FolderNodeType::Folder, "My Folder", None).unwrap();
        
        let child1_uuid = "22222222-2222-2222-2222-222222222222";
        insert_doc(&conn, "ref-topic", "Topic 1");
        create_folder_node(&mut conn, folder_uuid, child1_uuid, FolderNodeType::Topic, "Topic 1", Some("ref-topic")).unwrap();
        
        let child2_uuid = "33333333-3333-3333-3333-333333333333";
        insert_doc(&conn, "ref-topic-2", "Topic 2");
        create_folder_node(&mut conn, folder_uuid, child2_uuid, FolderNodeType::Topic, "Topic 2", Some("ref-topic-2")).unwrap();

        // Test get_folder_node
        let node = get_folder_node(&conn, folder_uuid).unwrap();
        assert_eq!(node.uuid, folder_uuid);
        assert_eq!(node.name, "My Folder");
        assert_eq!(node.typ, FolderNodeType::Folder);
        assert!(node.has_children);

        // Test get_folder_node_children
        let children = get_folder_node_children(&conn, folder_uuid).unwrap();
        assert_eq!(children.len(), 2);
        
        let child1 = children.iter().find(|c| c.uuid == child1_uuid).unwrap();
        assert_eq!(child1.name, "Topic 1");
        assert_eq!(child1.typ, FolderNodeType::Topic);
        assert!(!child1.has_children);
        
        let child2 = children.iter().find(|c| c.uuid == child2_uuid).unwrap();
        assert_eq!(child2.name, "Topic 2");
        assert_eq!(child2.typ, FolderNodeType::Topic);
        assert!(!child2.has_children);
    }

    #[test]
    pub fn test_folder_hierarchy_constraints() {
        let mut conn = get_memory_connection();
        let root = get_root_folder_uuid();

        // 1. Folder -> Folder
        let folder1_uuid = "10000000-0000-0000-0000-000000000001";
        create_folder_node(&mut conn, root, folder1_uuid, FolderNodeType::Folder, "Folder 1", None).unwrap();

        for (doc_id, title) in [
            ("ref-topic", "Topic 1"),
            ("ref-item", "Item 1"),
            ("ref-hl", "Highlight 1"),
            ("ref-item-2", "Item 2"),
            ("ref-hl-2", "Highlight 2"),
            ("ref-item-3", "Item 3"),
            ("ref", "Invalid Item"),
        ] {
            insert_doc(&conn, doc_id, title);
        }

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
