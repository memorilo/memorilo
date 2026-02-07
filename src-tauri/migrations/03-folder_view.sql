-- Rename base table and expose folder_nodes as a view with name sourced from docs.title
ALTER TABLE folder_nodes RENAME TO folder_nodes_base;

-- Note: when ref is set, name is sourced from docs.title; folder_nodes_base.name is ignored.
CREATE VIEW IF NOT EXISTS folder_nodes AS
SELECT
    f.uuid,
    f.parent_uuid,
    f.typ,
    CASE
        WHEN f.ref IS NOT NULL THEN d.title
        ELSE f.name
    END AS name,
    f.ref,
    f.created_at,
    f.children_updated_at
FROM folder_nodes_base f
LEFT JOIN docs d ON d.doc_id = f.ref;

-- Writable view: insert routes to base table and updates docs.title when ref is set
CREATE TRIGGER IF NOT EXISTS folder_nodes_view_insert
INSTEAD OF INSERT ON folder_nodes
BEGIN
    UPDATE docs
    SET title = NEW.name
    WHERE NEW.ref IS NOT NULL
      AND doc_id = NEW.ref
      AND title != NEW.name;

    INSERT INTO folder_nodes_base (uuid, parent_uuid, typ, name, ref)
    VALUES (NEW.uuid, NEW.parent_uuid, NEW.typ, NEW.name, NEW.ref);
END;

-- Writable view: update routes to base table and keeps docs.title in sync
CREATE TRIGGER IF NOT EXISTS folder_nodes_view_update
INSTEAD OF UPDATE ON folder_nodes
BEGIN
    UPDATE docs
    SET title = NEW.name
    WHERE NEW.ref IS NOT NULL
      AND doc_id = NEW.ref
      AND NEW.name != OLD.name
      AND title != NEW.name;

    UPDATE folder_nodes_base
    SET parent_uuid = NEW.parent_uuid,
        typ = NEW.typ,
        name = NEW.name,
        ref = NEW.ref
    WHERE uuid = OLD.uuid;
END;

-- Writable view: delete routes to base table
CREATE TRIGGER IF NOT EXISTS folder_nodes_view_delete
INSTEAD OF DELETE ON folder_nodes
BEGIN
    DELETE FROM folder_nodes_base WHERE uuid = OLD.uuid;
END;
