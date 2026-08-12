import type { EditorStorageDatabase } from './database-driver'
import { v7 as createUuidV7 } from 'uuid'

const shelfSchema = `
  CREATE TABLE IF NOT EXISTS shelf_sync_state (
    singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
    actor_id TEXT NOT NULL,
    last_physical INTEGER NOT NULL CHECK (last_physical >= 0),
    last_logical INTEGER NOT NULL CHECK (last_logical >= 0)
  );

  CREATE TABLE IF NOT EXISTS shelf_sources (
    id TEXT PRIMARY KEY,
    kind TEXT NOT NULL CHECK (kind = 'opds'),
    url TEXT NOT NULL,
    name TEXT NOT NULL,
    username TEXT,
    auth TEXT NOT NULL CHECK (auth IN ('none', 'basic')),
    enabled INTEGER NOT NULL CHECK (enabled IN (0, 1)),
    order_key TEXT NOT NULL,
    encrypted_password BLOB,
    deleted INTEGER NOT NULL DEFAULT 0 CHECK (deleted IN (0, 1)),
    field_clocks_json TEXT NOT NULL,
    added_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS shelf_sources_order_idx
    ON shelf_sources(deleted, enabled, order_key, id);

  CREATE TABLE IF NOT EXISTS shelf_source_operations (
    id TEXT PRIMARY KEY,
    actor_id TEXT NOT NULL,
    source_id TEXT NOT NULL,
    clock TEXT NOT NULL,
    fields_json TEXT NOT NULL,
    pending INTEGER NOT NULL CHECK (pending IN (0, 1)),
    created_at INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS shelf_source_operations_pending_idx
    ON shelf_source_operations(pending, clock, id);

  CREATE TABLE IF NOT EXISTS shelf_pages (
    source_id TEXT NOT NULL REFERENCES shelf_sources(id) ON DELETE CASCADE,
    url TEXT NOT NULL,
    page_json TEXT NOT NULL,
    etag TEXT,
    last_modified TEXT,
    fetched_at INTEGER NOT NULL,
    PRIMARY KEY (source_id, url)
  );
`

export async function initializeShelfStorage(database: EditorStorageDatabase): Promise<void> {
  await database.exec(shelfSchema)
  await database.run(`
    INSERT INTO shelf_sync_state (singleton, actor_id, last_physical, last_logical)
    VALUES (1, ?, 0, 0)
    ON CONFLICT(singleton) DO NOTHING
  `, [createUuidV7()])
}
