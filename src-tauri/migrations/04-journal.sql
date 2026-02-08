-- Journal entries (one per doc)
CREATE TABLE IF NOT EXISTS journals(
    -- Document id
    doc_id TEXT PRIMARY KEY,
    -- Creation time of the journal entry
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(doc_id) REFERENCES docs(doc_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_journals_created_at ON journals(created_at);

-- Trigger: Delete doc when a journal entry is removed
CREATE TRIGGER IF NOT EXISTS delete_doc_on_journal_delete
AFTER DELETE ON journals
BEGIN
    DELETE FROM docs WHERE doc_id = OLD.doc_id;
END;
