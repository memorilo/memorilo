-- Journal entries (one per doc)
CREATE TABLE IF NOT EXISTS journals(
    -- Document id
    doc_id TEXT PRIMARY KEY,
    -- The journal's own timestamp (used to derive the journal date via localtime).
    -- Must be explicitly set by the app (no default) to avoid mixing it up with docs.created_at.
    journal_at DATETIME NOT NULL,
    FOREIGN KEY(doc_id) REFERENCES docs(doc_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_journals_journal_at ON journals(journal_at);

-- Trigger: Delete doc when a journal entry is removed
CREATE TRIGGER IF NOT EXISTS delete_doc_on_journal_delete
AFTER DELETE ON journals
BEGIN
    DELETE FROM docs WHERE doc_id = OLD.doc_id;
END;
