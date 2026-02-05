-- Document update log (binary ProseMirror update payloads)
CREATE TABLE IF NOT EXISTS doc_updates(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    -- ProseMirror document id
    doc_id TEXT NOT NULL,
    -- Serialized update data (binary)
    data BLOB NOT NULL,
    -- Creation time of this update record
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    -- Originating client id (for sync purposes)
    client_id TEXT NOT NULL,
    -- Sync status: 0 = pending, 1 = synced, other values reserved. Pending updates maybe compacted later.
    sync_status INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_doc_updates_doc_id ON doc_updates(doc_id);

-- ProseMirror document tree stored as adjacency list
CREATE TABLE IF NOT EXISTS doc_nodes(
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    -- ProseMirror document id (one doc contains a full tree)
    doc_id TEXT NOT NULL,
    -- ProseMirror node attribute `uuid` (when present, e.g. listItem)
    node_uuid TEXT NULL,
    -- Adjacency list: parent node id; root ("doc") has NULL
    parent_id INTEGER NULL,
    -- Order among siblings, matches ProseMirror children sequence
    position INTEGER NOT NULL DEFAULT 0,
    -- ProseMirror node type name: doc, bulletList, listItem, paragraph, table, tableRow, tableCell, text, etc.
    node_name TEXT NOT NULL,
    -- ProseMirror node attributes JSON (e.g. {"folded":false} / {"rowspan":1,"colspan":1})
    attr TEXT NOT NULL,
    -- Text content for ProseMirror text leaf nodes; NULL for non-text nodes
    text TEXT NULL,
    FOREIGN KEY(parent_id) REFERENCES doc_nodes(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_doc_nodes_doc_id ON doc_nodes(doc_id);
CREATE INDEX IF NOT EXISTS idx_doc_nodes_parent_id ON doc_nodes(parent_id);
CREATE INDEX IF NOT EXISTS idx_doc_nodes_node_uuid ON doc_nodes(node_uuid);
CREATE UNIQUE INDEX IF NOT EXISTS uq_doc_nodes_doc_uuid ON doc_nodes(doc_id, node_uuid);

-- Trigger: Delete topic doc data when a topic folder node is removed
CREATE TRIGGER IF NOT EXISTS delete_topic_doc_on_folder_delete
AFTER DELETE ON folder_nodes
WHEN OLD.typ = 'topic' AND OLD.ref IS NOT NULL
BEGIN
    DELETE FROM doc_updates WHERE doc_id = OLD.ref;
    DELETE FROM doc_nodes WHERE doc_id = OLD.ref;
END;
