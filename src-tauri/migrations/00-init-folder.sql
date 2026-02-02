CREATE TABLE IF NOT EXISTS folder_nodes (
    uuid TEXT PRIMARY KEY,
    parent_uuid TEXT NULL,
    typ TEXT NOT NULL DEFAULT 'folder' CHECK (typ IN ('folder', 'topic', 'highlight', 'item')),
    name TEXT NOT NULL,
    ref TEXT NULL DEFAULT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    children_updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    CHECK (ref IS NOT NULL OR typ = 'folder'),
    CHECK (uuid = '00000000-0000-0000-0000-000000000000' OR parent_uuid IS NOT NULL),
    CHECK (uuid != '00000000-0000-0000-0000-000000000000' OR parent_uuid IS NULL),
    CHECK (parent_uuid IS NULL OR parent_uuid != uuid),
    FOREIGN KEY (parent_uuid) REFERENCES folder_nodes(uuid) ON DELETE CASCADE
);


-- Insert root folder node if not exists
-- The node with UUID '00000000-0000-0000-0000-000000000000' represents the root folder
-- It cannot be deleted or modified, and serves as the top-level parent for all other folder nodes
-- never display this node to users
INSERT OR IGNORE INTO folder_nodes (uuid, typ, name) VALUES ('00000000-0000-0000-0000-000000000000', 'folder', '<ROOT>');

CREATE INDEX IF NOT EXISTS idx_folder_nodes_parent ON folder_nodes(parent_uuid);

-- Table to log pending operations on folder nodes, for synchronization or batch processing, do not delete or modify
CREATE TABLE IF NOT EXISTS folder_node_pending_ops (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    op TEXT NOT NULL CHECK (op IN ('create', 'update', 'delete')),
    target_node_uuid TEXT NOT NULL,
    new_typ TEXT NULL DEFAULT NULL,
    new_name TEXT NULL DEFAULT NULL,
    new_uuid TEXT NULL DEFAULT NULL,
    new_ref TEXT NULL DEFAULT NULL,
    execution_time DATETIME DEFAULT CURRENT_TIMESTAMP,
    CHECK ((new_name IS NULL AND new_uuid IS NULL) OR (new_name IS NOT NULL AND new_uuid IS NOT NULL))
);

-- Trigger: Update children_updated_at on ancestors when a node is updated
CREATE TRIGGER IF NOT EXISTS update_ancestors_on_node_update
AFTER UPDATE ON folder_nodes
BEGIN
    UPDATE folder_nodes 
    SET children_updated_at = CURRENT_TIMESTAMP
    WHERE uuid IN (
        WITH RECURSIVE ancestors(id) AS (
            SELECT parent_uuid FROM folder_nodes WHERE uuid = NEW.uuid AND parent_uuid IS NOT NULL
            UNION ALL
            SELECT f.parent_uuid FROM folder_nodes f
            JOIN ancestors a ON f.uuid = a.id
            WHERE f.parent_uuid IS NOT NULL
        )
        SELECT id FROM ancestors
    );
END;

-- Trigger: Update children_updated_at on ancestors when a node is inserted
CREATE TRIGGER IF NOT EXISTS update_ancestors_on_node_insert
AFTER INSERT ON folder_nodes
BEGIN
    UPDATE folder_nodes 
    SET children_updated_at = CURRENT_TIMESTAMP
    WHERE uuid IN (
        WITH RECURSIVE ancestors(id) AS (
            SELECT NEW.parent_uuid WHERE NEW.parent_uuid IS NOT NULL
            UNION ALL
            SELECT f.parent_uuid FROM folder_nodes f
            JOIN ancestors a ON f.uuid = a.id
            WHERE f.parent_uuid IS NOT NULL
        )
        SELECT id FROM ancestors
    );
END;

-- Trigger: Update children_updated_at on ancestors when a node is deleted
CREATE TRIGGER IF NOT EXISTS update_ancestors_on_node_delete
AFTER DELETE ON folder_nodes
BEGIN
    UPDATE folder_nodes 
    SET children_updated_at = CURRENT_TIMESTAMP
    WHERE uuid IN (
        WITH RECURSIVE ancestors(id) AS (
            SELECT OLD.parent_uuid WHERE OLD.parent_uuid IS NOT NULL
            UNION ALL
            SELECT f.parent_uuid FROM folder_nodes f
            JOIN ancestors a ON f.uuid = a.id
            WHERE f.parent_uuid IS NOT NULL
        )
        SELECT id FROM ancestors
    );
END;

-- Trigger: Prevent cycles, ensure tree structure on update
CREATE TRIGGER IF NOT EXISTS prevent_cycles_on_node_update
BEFORE UPDATE OF parent_uuid ON folder_nodes
BEGIN
    SELECT RAISE(FAIL, 'Cycle detected')
    WHERE NEW.parent_uuid IS NOT NULL AND (
        NEW.parent_uuid = NEW.uuid OR EXISTS (
            WITH RECURSIVE descendants(id) AS (
                SELECT uuid FROM folder_nodes WHERE parent_uuid = NEW.uuid
                UNION ALL
                SELECT f.uuid FROM folder_nodes f
                JOIN descendants d ON f.parent_uuid = d.id
            )
            SELECT 1 FROM descendants WHERE id = NEW.parent_uuid
        )
    );
END;

-- Trigger: Enforce node type hierarchy on insert
CREATE TRIGGER IF NOT EXISTS enforce_node_type_hierarchy_insert
BEFORE INSERT ON folder_nodes
BEGIN
    SELECT RAISE(FAIL, 'Invalid parent-child relationship based on node types')
    WHERE NEW.parent_uuid IS NOT NULL AND NOT EXISTS (
        SELECT 1
        FROM folder_nodes parent
        WHERE parent.uuid = NEW.parent_uuid
          AND (
              (parent.typ = 'folder' AND NEW.typ IN ('folder', 'topic')) OR
              (parent.typ = 'topic' AND NEW.typ IN ('highlight', 'item')) OR
              (parent.typ = 'highlight' AND NEW.typ IN ('highlight', 'item')) OR
              (parent.typ = 'item' AND NEW.typ = 'item')
          )
    );
END;

-- Trigger: Enforce node type hierarchy on update
CREATE TRIGGER IF NOT EXISTS enforce_node_type_hierarchy_update
BEFORE UPDATE OF parent_uuid, typ ON folder_nodes
BEGIN
    SELECT RAISE(FAIL, 'Invalid parent-child relationship based on node types')
    WHERE NEW.parent_uuid IS NOT NULL AND NOT EXISTS (
        SELECT 1
        FROM folder_nodes parent
        WHERE parent.uuid = NEW.parent_uuid
          AND (
              (parent.typ = 'folder' AND NEW.typ IN ('folder', 'topic')) OR
              (parent.typ = 'topic' AND NEW.typ IN ('highlight', 'item')) OR
              (parent.typ = 'highlight' AND NEW.typ IN ('highlight', 'item')) OR
              (parent.typ = 'item' AND NEW.typ = 'item')
          )
    );
END;
