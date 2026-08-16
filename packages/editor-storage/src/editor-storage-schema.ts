import type { EditorStorageDatabase } from './database-driver'
import type { EmbeddingModel } from './embedding-model'

interface EmbeddingConfigurationRow {
  dimensions: number
  model_id: string
}

interface SchemaSqlRow {
  sql: string | null
}

const schema = `
  PRAGMA foreign_keys = ON;
  PRAGMA busy_timeout = 5000;

  CREATE TABLE IF NOT EXISTS notes (
    row_id INTEGER PRIMARY KEY AUTOINCREMENT,
    id TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    kind TEXT NOT NULL DEFAULT 'regular' CHECK (kind IN ('regular', 'journal')),
    checkpoint_snapshot BLOB,
    checkpoint_sequence INTEGER NOT NULL DEFAULT 0 CHECK (checkpoint_sequence >= 0),
    latest_sequence INTEGER NOT NULL DEFAULT 0 CHECK (latest_sequence >= checkpoint_sequence),
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS user_documents (
    document_id TEXT PRIMARY KEY CHECK (length(trim(document_id)) > 0),
    snapshot BLOB NOT NULL CHECK (length(snapshot) > 0),
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS journals (
    note_row_id INTEGER PRIMARY KEY REFERENCES notes(row_id) ON DELETE CASCADE,
    journal_date TEXT NOT NULL UNIQUE
      CHECK (journal_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
    has_user_content INTEGER NOT NULL CHECK (has_user_content IN (0, 1))
  );

  CREATE INDEX IF NOT EXISTS journals_feed_idx
    ON journals(has_user_content, journal_date DESC);

  CREATE TABLE IF NOT EXISTS assets (
    file_name TEXT PRIMARY KEY,
    original_file_name TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    byte_size INTEGER NOT NULL CHECK (byte_size > 0),
    created_at INTEGER NOT NULL,
    unreferenced_at INTEGER,
    deletion_claimed_at INTEGER
  );

  CREATE TABLE IF NOT EXISTS note_asset_references (
    note_row_id INTEGER NOT NULL REFERENCES notes(row_id) ON DELETE CASCADE,
    asset_file_name TEXT NOT NULL REFERENCES assets(file_name) ON DELETE RESTRICT,
    reference_count INTEGER NOT NULL CHECK (reference_count > 0),
    PRIMARY KEY (note_row_id, asset_file_name)
  );

  CREATE INDEX IF NOT EXISTS note_asset_references_asset_idx
    ON note_asset_references(asset_file_name);

  CREATE TRIGGER IF NOT EXISTS note_asset_references_insert_mark_referenced
  AFTER INSERT ON note_asset_references
  BEGIN
    UPDATE assets SET unreferenced_at = NULL WHERE file_name = new.asset_file_name;
  END;

  CREATE TRIGGER IF NOT EXISTS note_asset_references_delete_mark_unreferenced
  AFTER DELETE ON note_asset_references
  WHEN NOT EXISTS (
    SELECT 1 FROM note_asset_references WHERE asset_file_name = old.asset_file_name
  )
  BEGIN
    UPDATE assets
    SET unreferenced_at = COALESCE(
      unreferenced_at,
      CAST((julianday('now') - 2440587.5) * 86400000 AS INTEGER)
    )
    WHERE file_name = old.asset_file_name;
  END;

  CREATE TRIGGER IF NOT EXISTS note_asset_references_insert_available
  BEFORE INSERT ON note_asset_references
  WHEN (SELECT deletion_claimed_at FROM assets WHERE file_name = new.asset_file_name) IS NOT NULL
  BEGIN
    SELECT RAISE(ABORT, 'Asset is being reclaimed');
  END;

  CREATE TRIGGER IF NOT EXISTS note_asset_references_update_available
  BEFORE UPDATE OF asset_file_name ON note_asset_references
  WHEN (SELECT deletion_claimed_at FROM assets WHERE file_name = new.asset_file_name) IS NOT NULL
  BEGIN
    SELECT RAISE(ABORT, 'Asset is being reclaimed');
  END;

  CREATE TABLE IF NOT EXISTS note_updates (
    note_row_id INTEGER NOT NULL REFERENCES notes(row_id) ON DELETE CASCADE,
    sequence INTEGER NOT NULL CHECK (sequence > 0),
    update_hash TEXT NOT NULL,
    update_blob BLOB NOT NULL,
    created_at INTEGER NOT NULL,
    PRIMARY KEY (note_row_id, sequence),
    UNIQUE (note_row_id, update_hash)
  );

  CREATE TABLE IF NOT EXISTS note_update_receipts (
    note_row_id INTEGER NOT NULL REFERENCES notes(row_id) ON DELETE CASCADE,
    update_hash TEXT NOT NULL,
    sequence INTEGER NOT NULL CHECK (sequence > 0),
    created_at INTEGER NOT NULL,
    PRIMARY KEY (note_row_id, update_hash)
  );

  CREATE TABLE IF NOT EXISTS note_entries (
    row_id INTEGER PRIMARY KEY AUTOINCREMENT,
    note_row_id INTEGER NOT NULL REFERENCES notes(row_id) ON DELETE CASCADE,
    entry_id TEXT NOT NULL,
    parent_entry_id TEXT,
    ordinal INTEGER NOT NULL CHECK (ordinal >= 0),
    kind TEXT NOT NULL CHECK (kind IN ('folder', 'topic')),
    label TEXT NOT NULL,
    UNIQUE (note_row_id, entry_id)
  );

  CREATE INDEX IF NOT EXISTS note_entries_parent_order_idx
    ON note_entries(note_row_id, parent_entry_id, ordinal);

  CREATE TABLE IF NOT EXISTS topics (
    row_id INTEGER PRIMARY KEY AUTOINCREMENT,
    note_row_id INTEGER NOT NULL REFERENCES notes(row_id) ON DELETE CASCADE,
    topic_id TEXT NOT NULL,
    topic_type TEXT NOT NULL CHECK (topic_type IN ('regular', 'book', 'image-occlusion', 'spreadsheet', 'whiteboard')),
    editor_mode INTEGER CHECK (editor_mode IN (0, 1)),
    card_source_json TEXT,
    title TEXT NOT NULL,
    UNIQUE (note_row_id, topic_id)
  );

  CREATE TABLE IF NOT EXISTS book_topics (
    note_row_id INTEGER NOT NULL,
    topic_id TEXT NOT NULL,
    format TEXT NOT NULL CHECK (format IN ('cbr', 'cbz', 'epub', 'pdf', 'txt')),
    content_hash TEXT NOT NULL CHECK (
      length(content_hash) = 64 AND content_hash NOT GLOB '*[^0-9a-f]*'
    ),
    byte_length INTEGER NOT NULL CHECK (byte_length > 0),
    original_name TEXT NOT NULL,
    publication_title TEXT NOT NULL,
    authors_json TEXT NOT NULL,
    retrieval_hints_json TEXT NOT NULL,
    PRIMARY KEY (note_row_id, topic_id),
    UNIQUE (note_row_id, format, content_hash),
    FOREIGN KEY (note_row_id, topic_id)
      REFERENCES topics(note_row_id, topic_id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS book_topics_file_idx
    ON book_topics(format, content_hash);

  CREATE TABLE IF NOT EXISTS spreadsheet_sheets (
    note_row_id INTEGER NOT NULL,
    topic_id TEXT NOT NULL,
    sheet_id TEXT NOT NULL CHECK (length(trim(sheet_id)) > 0),
    ordinal INTEGER NOT NULL CHECK (ordinal >= 0),
    name TEXT NOT NULL CHECK (length(trim(name)) > 0),
    PRIMARY KEY (note_row_id, topic_id, sheet_id),
    UNIQUE (note_row_id, topic_id, ordinal),
    FOREIGN KEY (note_row_id, topic_id)
      REFERENCES topics(note_row_id, topic_id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS spreadsheet_rows (
    note_row_id INTEGER NOT NULL,
    topic_id TEXT NOT NULL,
    sheet_id TEXT NOT NULL,
    row_id TEXT NOT NULL CHECK (length(trim(row_id)) > 0),
    ordinal INTEGER NOT NULL CHECK (ordinal >= 0),
    PRIMARY KEY (note_row_id, topic_id, sheet_id, row_id),
    UNIQUE (note_row_id, topic_id, sheet_id, ordinal),
    FOREIGN KEY (note_row_id, topic_id, sheet_id)
      REFERENCES spreadsheet_sheets(note_row_id, topic_id, sheet_id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS spreadsheet_columns (
    note_row_id INTEGER NOT NULL,
    topic_id TEXT NOT NULL,
    sheet_id TEXT NOT NULL,
    column_id TEXT NOT NULL CHECK (length(trim(column_id)) > 0),
    ordinal INTEGER NOT NULL CHECK (ordinal >= 0),
    PRIMARY KEY (note_row_id, topic_id, sheet_id, column_id),
    UNIQUE (note_row_id, topic_id, sheet_id, ordinal),
    FOREIGN KEY (note_row_id, topic_id, sheet_id)
      REFERENCES spreadsheet_sheets(note_row_id, topic_id, sheet_id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS spreadsheet_cells (
    storage_row_id INTEGER PRIMARY KEY AUTOINCREMENT,
    note_row_id INTEGER NOT NULL,
    topic_id TEXT NOT NULL,
    sheet_id TEXT NOT NULL,
    sheet_row_id TEXT NOT NULL,
    column_id TEXT NOT NULL,
    input TEXT NOT NULL,
    display TEXT NOT NULL,
    format_json TEXT NOT NULL,
    formula_references_json TEXT NOT NULL,
    UNIQUE (note_row_id, topic_id, sheet_id, sheet_row_id, column_id),
    FOREIGN KEY (note_row_id, topic_id, sheet_id, sheet_row_id)
      REFERENCES spreadsheet_rows(note_row_id, topic_id, sheet_id, row_id) ON DELETE CASCADE,
    FOREIGN KEY (note_row_id, topic_id, sheet_id, column_id)
      REFERENCES spreadsheet_columns(note_row_id, topic_id, sheet_id, column_id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS spreadsheet_cells_topic_idx
    ON spreadsheet_cells(note_row_id, topic_id, sheet_id, sheet_row_id, column_id);

  CREATE VIRTUAL TABLE IF NOT EXISTS spreadsheet_cells_fts USING fts5(
    input,
    display,
    content='spreadsheet_cells',
    content_rowid='storage_row_id',
    tokenize='trigram'
  );

  CREATE TRIGGER IF NOT EXISTS spreadsheet_cells_fts_insert
  AFTER INSERT ON spreadsheet_cells BEGIN
    INSERT INTO spreadsheet_cells_fts(rowid, input, display)
      VALUES (new.storage_row_id, new.input, new.display);
  END;

  CREATE TRIGGER IF NOT EXISTS spreadsheet_cells_fts_delete
  AFTER DELETE ON spreadsheet_cells BEGIN
    INSERT INTO spreadsheet_cells_fts(spreadsheet_cells_fts, rowid, input, display)
      VALUES ('delete', old.storage_row_id, old.input, old.display);
  END;

  CREATE TRIGGER IF NOT EXISTS spreadsheet_cells_fts_update
  AFTER UPDATE OF input, display ON spreadsheet_cells BEGIN
    INSERT INTO spreadsheet_cells_fts(spreadsheet_cells_fts, rowid, input, display)
      VALUES ('delete', old.storage_row_id, old.input, old.display);
    INSERT INTO spreadsheet_cells_fts(rowid, input, display)
      VALUES (new.storage_row_id, new.input, new.display);
  END;

  CREATE TABLE IF NOT EXISTS note_favorites (
    note_row_id INTEGER PRIMARY KEY REFERENCES notes(row_id) ON DELETE CASCADE,
    favorited_at INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS note_favorites_order_idx
    ON note_favorites(favorited_at DESC, note_row_id DESC);

  CREATE TABLE IF NOT EXISTS note_open_history (
    note_row_id INTEGER PRIMARY KEY REFERENCES notes(row_id) ON DELETE CASCADE,
    topic_id TEXT NOT NULL,
    opened_at INTEGER NOT NULL,
    FOREIGN KEY (note_row_id, topic_id)
      REFERENCES topics(note_row_id, topic_id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS note_open_history_order_idx
    ON note_open_history(opened_at DESC, note_row_id DESC);

  CREATE TABLE IF NOT EXISTS topic_blocks (
    row_id INTEGER PRIMARY KEY AUTOINCREMENT,
    note_row_id INTEGER NOT NULL REFERENCES notes(row_id) ON DELETE CASCADE,
    topic_id TEXT NOT NULL,
    block_id TEXT NOT NULL,
    parent_block_id TEXT,
    ordinal INTEGER NOT NULL CHECK (ordinal >= 0),
    kind TEXT NOT NULL,
    text TEXT NOT NULL,
    attributes_json TEXT NOT NULL,
    content_hash TEXT NOT NULL,
    UNIQUE (note_row_id, topic_id, block_id),
    FOREIGN KEY (note_row_id, topic_id)
      REFERENCES topics(note_row_id, topic_id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS topic_blocks_parent_order_idx
    ON topic_blocks(note_row_id, topic_id, parent_block_id, ordinal);

  CREATE INDEX IF NOT EXISTS topic_blocks_task_feed_idx
    ON topic_blocks(row_id DESC)
    WHERE kind = 'task';

  CREATE INDEX IF NOT EXISTS topic_blocks_task_status_idx
    ON topic_blocks(json_extract(attributes_json, '$.status'), row_id DESC)
    WHERE kind = 'task';

  CREATE TABLE IF NOT EXISTS todo_calendar_subscriptions (
    id TEXT PRIMARY KEY CHECK (length(trim(id)) > 0),
    url TEXT NOT NULL UNIQUE CHECK (length(trim(url)) > 0),
    title TEXT NOT NULL,
    enabled INTEGER NOT NULL CHECK (enabled IN (0, 1)),
    version TEXT,
    fetched_at INTEGER,
    etag TEXT,
    last_modified TEXT
  );

  CREATE TABLE IF NOT EXISTS todo_calendar_versions (
    subscription_id TEXT NOT NULL REFERENCES todo_calendar_subscriptions(id) ON DELETE CASCADE,
    version TEXT NOT NULL,
    fetched_at INTEGER NOT NULL,
    raw_ics TEXT NOT NULL,
    PRIMARY KEY (subscription_id, version)
  );

  CREATE TABLE IF NOT EXISTS todo_calendar_events (
    subscription_id TEXT NOT NULL,
    version TEXT NOT NULL,
    uid TEXT NOT NULL,
    start_date TEXT NOT NULL CHECK (start_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
    end_date TEXT CHECK (end_date IS NULL OR end_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
    title TEXT NOT NULL,
    PRIMARY KEY (subscription_id, version, uid, start_date),
    FOREIGN KEY (subscription_id, version)
      REFERENCES todo_calendar_versions(subscription_id, version) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS todo_calendar_events_date_idx
    ON todo_calendar_events(start_date, end_date);

  CREATE VIRTUAL TABLE IF NOT EXISTS topic_blocks_fts USING fts5(
    text,
    content='topic_blocks',
    content_rowid='row_id',
    tokenize='trigram'
  );

  CREATE TRIGGER IF NOT EXISTS topic_blocks_fts_insert
  AFTER INSERT ON topic_blocks BEGIN
    INSERT INTO topic_blocks_fts(rowid, text) VALUES (new.row_id, new.text);
  END;

  CREATE TRIGGER IF NOT EXISTS topic_blocks_fts_delete
  AFTER DELETE ON topic_blocks BEGIN
    INSERT INTO topic_blocks_fts(topic_blocks_fts, rowid, text)
      VALUES ('delete', old.row_id, old.text);
  END;

  CREATE TRIGGER IF NOT EXISTS topic_blocks_fts_update
  AFTER UPDATE OF text ON topic_blocks BEGIN
    INSERT INTO topic_blocks_fts(topic_blocks_fts, rowid, text)
      VALUES ('delete', old.row_id, old.text);
    INSERT INTO topic_blocks_fts(rowid, text) VALUES (new.row_id, new.text);
  END;

  CREATE TABLE IF NOT EXISTS editor_storage_embedding_configuration (
    singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
    model_id TEXT NOT NULL,
    dimensions INTEGER NOT NULL CHECK (dimensions > 0)
  );

  CREATE TABLE IF NOT EXISTS topic_block_embedding_state (
    block_row_id INTEGER PRIMARY KEY REFERENCES topic_blocks(row_id) ON DELETE CASCADE,
    model_id TEXT NOT NULL,
    content_hash TEXT NOT NULL
  );
`

const noteKindConstraints = `
  CREATE UNIQUE INDEX IF NOT EXISTS notes_regular_title_unique
    ON notes(title COLLATE NOCASE)
    WHERE kind = 'regular';

  CREATE TRIGGER IF NOT EXISTS journals_insert_note_identity
  BEFORE INSERT ON journals
  WHEN NOT EXISTS (
    SELECT 1
    FROM notes
    WHERE row_id = new.note_row_id
      AND kind = 'journal'
      AND title = new.journal_date
  )
  BEGIN
    SELECT RAISE(ABORT, 'Journal Note identity is invalid');
  END;

  CREATE TRIGGER IF NOT EXISTS journals_update_note_identity
  BEFORE UPDATE OF note_row_id, journal_date ON journals
  WHEN NOT EXISTS (
    SELECT 1
    FROM notes
    WHERE row_id = new.note_row_id
      AND kind = 'journal'
      AND title = new.journal_date
  )
  BEGIN
    SELECT RAISE(ABORT, 'Journal Note identity is invalid');
  END;

  CREATE TRIGGER IF NOT EXISTS notes_update_journal_identity
  BEFORE UPDATE OF title, kind ON notes
  WHEN EXISTS (
    SELECT 1
    FROM journals
    WHERE note_row_id = old.row_id
      AND (new.kind <> 'journal' OR new.title <> journal_date)
  )
  BEGIN
    SELECT RAISE(ABORT, 'Journal Note identity is immutable');
  END;
`

function vectorSchema(dimensions: number): string {
  return `
    CREATE VIRTUAL TABLE IF NOT EXISTS topic_block_embeddings USING vec0(
      block_row_id INTEGER PRIMARY KEY,
      note_row_id INTEGER PARTITION KEY,
      embedding FLOAT[${dimensions}]
    );
  `
}

function validateEmbeddingModel(model: EmbeddingModel): void {
  if (model.id.trim().length === 0)
    throw new TypeError('Embedding model id must be a non-empty string')
  if (!Number.isInteger(model.dimensions) || model.dimensions < 1)
    throw new RangeError('Embedding model dimensions must be a positive integer')
}

export async function initializeEditorStorageSchema(
  database: EditorStorageDatabase,
  embeddingModel: EmbeddingModel,
): Promise<void> {
  validateEmbeddingModel(embeddingModel)
  const existingTopics = await database.get<SchemaSqlRow>(`
    SELECT sql
    FROM sqlite_master
    WHERE type = 'table' AND name = 'topics'
  `)
  if (existingTopics && !existingTopics.sql?.includes('\'spreadsheet\'')) {
    throw new Error(
      'Unsupported topics schema: SpreadsheetTopic is required; delete the existing database before starting Memorilo',
    )
  }
  await database.exec(schema)

  const noteColumns = await database.all<{ name: string }>('PRAGMA table_info(notes)')
  if (!noteColumns.some(column => column.name === 'created_at')) {
    throw new Error(
      'Unsupported notes schema: created_at is required; delete the existing database before starting Memorilo',
    )
  }
  if (!noteColumns.some(column => column.name === 'kind')) {
    throw new Error(
      'Unsupported notes schema: kind is required; delete the existing database before starting Memorilo',
    )
  }
  await database.exec(noteKindConstraints)

  const configuration = await database.get<EmbeddingConfigurationRow>(`
    SELECT model_id, dimensions
    FROM editor_storage_embedding_configuration
    WHERE singleton = 1
  `)
  if (configuration && (
    configuration.model_id !== embeddingModel.id
    || configuration.dimensions !== embeddingModel.dimensions
  )) {
    await database.batch([
      { sql: 'DROP TABLE IF EXISTS topic_block_embeddings' },
      { sql: 'DELETE FROM topic_block_embedding_state' },
      {
        parameters: [embeddingModel.id, embeddingModel.dimensions],
        sql: `
          UPDATE editor_storage_embedding_configuration
          SET model_id = ?, dimensions = ?
          WHERE singleton = 1
        `,
      },
    ])
  }

  await database.exec(vectorSchema(embeddingModel.dimensions))
  await database.run(`
    INSERT INTO editor_storage_embedding_configuration (singleton, model_id, dimensions)
    VALUES (1, ?, ?)
    ON CONFLICT(singleton) DO NOTHING
  `, [embeddingModel.id, embeddingModel.dimensions])
}
