CREATE TABLE IF NOT EXISTS folder_nodes (
    uuid TEXT PRIMARY KEY,
    typ TEXT NOT NULL DEFAULT 'folder' CHECK (typ IN ('folder', 'topic', 'highlight', 'item')),
    name TEXT NOT NULL,
    ref TEXT NULL DEFAULT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    children_updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    CHECK (ref IS NOT NULL OR typ = 'folder')
);

CREATE TABLE IF NOT EXISTS folder_node_hierarchy (
    parent_uuid TEXT NOT NULL,
    child_uuid TEXT NOT NULL,
    PRIMARY KEY (parent_uuid, child_uuid),
    FOREIGN KEY (parent_uuid) REFERENCES folder_nodes(uuid) ON DELETE CASCADE,
    FOREIGN KEY (child_uuid) REFERENCES folder_nodes(uuid) ON DELETE CASCADE
);


-- Insert root folder node if not exists
-- The node with UUID '00000000-0000-0000-0000-000000000000' represents the root folder
-- It cannot be deleted or modified, and serves as the top-level parent for all other folder nodes
-- never display this node to users
INSERT OR IGNORE INTO folder_nodes (uuid, typ, name) VALUES ('00000000-0000-0000-0000-000000000000', 'folder', '<ROOT>');

-- Ensure single parent (Tree structure)
CREATE UNIQUE INDEX IF NOT EXISTS idx_folder_node_hierarchy_child ON folder_node_hierarchy(child_uuid);

-- Table to log pending operations on folder nodes, for synchronization or batch processing, do not delete or modify
CREATE TABLE IF NOT EXISTS folder_node_pending_ops (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    op TEXT NOT NULL CHECK (op IN ('create', 'update', 'delete')),
    target_node_uuid TEXT NOT NULL,
    new_typ TEXT NULL DEFAULT NULL,
    new_name TEXT NULL DEFAULT NULL,
    new_uuid TEXT NULL DEFAULT NULL,
    new_ref TEXT NULL DEFAULT NULL,
    execuation_time DATETIME DEFAULT CURRENT_TIMESTAMP,
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
            SELECT parent_uuid FROM folder_node_hierarchy WHERE child_uuid = NEW.uuid
            UNION ALL
            SELECT h.parent_uuid FROM folder_node_hierarchy h
            JOIN ancestors a ON h.child_uuid = a.id
        )
        SELECT id FROM ancestors
    );
END;

-- Trigger: Update children_updated_at on ancestors when hierarchy changes (insert)
CREATE TRIGGER IF NOT EXISTS update_ancestors_on_hierarchy_insert
AFTER INSERT ON folder_node_hierarchy
BEGIN
    UPDATE folder_nodes 
    SET children_updated_at = CURRENT_TIMESTAMP
    WHERE uuid IN (
        WITH RECURSIVE ancestors(id) AS (
            SELECT NEW.parent_uuid
            UNION ALL
            SELECT h.parent_uuid FROM folder_node_hierarchy h
            JOIN ancestors a ON h.child_uuid = a.id
        )
        SELECT id FROM ancestors
    );
END;

-- Trigger: Update children_updated_at on ancestors when hierarchy changes (delete)
CREATE TRIGGER IF NOT EXISTS update_ancestors_on_hierarchy_delete
AFTER DELETE ON folder_node_hierarchy
BEGIN
    UPDATE folder_nodes 
    SET children_updated_at = CURRENT_TIMESTAMP
    WHERE uuid IN (
        WITH RECURSIVE ancestors(id) AS (
            SELECT OLD.parent_uuid
            UNION ALL
            SELECT h.parent_uuid FROM folder_node_hierarchy h
            JOIN ancestors a ON h.child_uuid = a.id
        )
        SELECT id FROM ancestors
    );
END;

-- Trigger: Prevent cycles, ensure tree structure on insert
CREATE TRIGGER IF NOT EXISTS prevent_cycles_on_insert
BEFORE INSERT ON folder_node_hierarchy
BEGIN
    SELECT RAISE(FAIL, 'Cycle detected')
    WHERE EXISTS (
        WITH RECURSIVE ancestors(id) AS (
            SELECT parent_uuid FROM folder_node_hierarchy WHERE child_uuid = NEW.parent_uuid
            UNION ALL
            SELECT h.parent_uuid FROM folder_node_hierarchy h
            JOIN ancestors a ON h.child_uuid = a.id
        )
        SELECT 1 FROM ancestors WHERE id = NEW.child_uuid
    ) OR NEW.parent_uuid = NEW.child_uuid;
END;
