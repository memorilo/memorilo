export const GLOBAL_OPTIMIZER_ID = '00000000-0000-7000-8000-000000000001'
export const GLOBAL_OPTIMIZER_REVISION_ID = '00000000-0000-7000-8000-000000000002'

export const learningSchema = `
  CREATE TABLE IF NOT EXISTS learning_optimizers (
    optimizer_id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    is_global INTEGER NOT NULL CHECK (is_global IN (0, 1)),
    status TEXT NOT NULL CHECK (status IN ('active', 'archived')),
    current_revision_id TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    sync_sequence INTEGER NOT NULL DEFAULT -1
  );

  CREATE UNIQUE INDEX IF NOT EXISTS learning_global_optimizer_idx
    ON learning_optimizers(is_global) WHERE is_global = 1;

  CREATE UNIQUE INDEX IF NOT EXISTS learning_active_optimizer_name_idx
    ON learning_optimizers(name COLLATE NOCASE) WHERE status = 'active';

  CREATE TABLE IF NOT EXISTS learning_optimizer_revisions (
    revision_id TEXT PRIMARY KEY,
    optimizer_id TEXT NOT NULL REFERENCES learning_optimizers(optimizer_id) ON DELETE CASCADE,
    configuration_json TEXT NOT NULL,
    fsrs_version TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    sync_sequence INTEGER NOT NULL DEFAULT -1
  );

  CREATE INDEX IF NOT EXISTS learning_optimizer_revisions_owner_idx
    ON learning_optimizer_revisions(optimizer_id, created_at);

  CREATE TABLE IF NOT EXISTS learning_note_optimizer_assignments (
    note_id TEXT PRIMARY KEY,
    optimizer_id TEXT NOT NULL REFERENCES learning_optimizers(optimizer_id),
    updated_at INTEGER NOT NULL,
    sync_sequence INTEGER NOT NULL DEFAULT -1
  );

  CREATE INDEX IF NOT EXISTS learning_note_optimizer_owner_idx
    ON learning_note_optimizer_assignments(optimizer_id, note_id);

  CREATE TABLE IF NOT EXISTS learning_cards (
    card_id TEXT PRIMARY KEY,
    note_id TEXT NOT NULL,
    topic_id TEXT NOT NULL,
    topic_order INTEGER NOT NULL CHECK (topic_order >= 0),
    source_block_id TEXT NOT NULL,
    source_order INTEGER NOT NULL CHECK (source_order >= 0),
    kind TEXT NOT NULL CHECK (kind IN ('basic', 'cloze', 'list', 'set')),
    direction TEXT NOT NULL CHECK (direction IN ('backward', 'forward')),
    active INTEGER NOT NULL CHECK (active IN (0, 1)),
    first_seen_at INTEGER NOT NULL,
    last_seen_at INTEGER NOT NULL,
    inactive_at INTEGER,
    sync_sequence INTEGER NOT NULL DEFAULT -1
  );

  CREATE TABLE IF NOT EXISTS learning_reading_items (
    reading_item_id TEXT PRIMARY KEY,
    note_id TEXT NOT NULL,
    topic_id TEXT NOT NULL,
    source_block_id TEXT NOT NULL,
    highlight_id TEXT NOT NULL,
    state TEXT NOT NULL CHECK (state IN ('new', 'learning', 'processed')),
    priority INTEGER NOT NULL DEFAULT 0,
    next_process_at INTEGER,
    read_point INTEGER NOT NULL DEFAULT 0 CHECK (read_point >= 0),
    last_processed_at INTEGER,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    UNIQUE(note_id, source_block_id, highlight_id)
  );

  CREATE INDEX IF NOT EXISTS learning_reading_items_queue_idx
    ON learning_reading_items(next_process_at, priority, reading_item_id);

  CREATE INDEX IF NOT EXISTS learning_reading_items_note_idx
    ON learning_reading_items(note_id, topic_id, state);

  CREATE INDEX IF NOT EXISTS learning_cards_topic_idx
    ON learning_cards(note_id, topic_id, active);

  CREATE INDEX IF NOT EXISTS learning_cards_sibling_idx
    ON learning_cards(source_block_id, active);

  CREATE TABLE IF NOT EXISTS learning_card_introductions (
    card_id TEXT PRIMARY KEY REFERENCES learning_cards(card_id) ON DELETE CASCADE,
    introduced_at INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS learning_card_introductions_time_idx
    ON learning_card_introductions(introduced_at);

  CREATE TABLE IF NOT EXISTS learning_targets (
    target_id TEXT PRIMARY KEY,
    card_id TEXT NOT NULL REFERENCES learning_cards(card_id) ON DELETE CASCADE,
    target_kind TEXT NOT NULL CHECK (target_kind IN ('whole', 'item')),
    item_block_id TEXT,
    target_order INTEGER NOT NULL CHECK (target_order >= 0),
    active INTEGER NOT NULL CHECK (active IN (0, 1)),
    partial_active INTEGER NOT NULL DEFAULT 0 CHECK (partial_active IN (0, 1)),
    created_at INTEGER NOT NULL,
    inactive_at INTEGER,
    CHECK (
      (target_kind = 'whole' AND item_block_id IS NULL)
      OR (target_kind = 'item' AND item_block_id IS NOT NULL)
    )
  );

  CREATE UNIQUE INDEX IF NOT EXISTS learning_whole_target_idx
    ON learning_targets(card_id) WHERE target_kind = 'whole';

  CREATE UNIQUE INDEX IF NOT EXISTS learning_item_target_idx
    ON learning_targets(card_id, item_block_id) WHERE target_kind = 'item';

  CREATE TABLE IF NOT EXISTS learning_states (
    target_id TEXT PRIMARY KEY REFERENCES learning_targets(target_id) ON DELETE CASCADE,
    phase TEXT NOT NULL CHECK (phase IN ('new', 'learning', 'review', 'relearning')),
    due_at INTEGER NOT NULL,
    stability REAL NOT NULL,
    difficulty REAL NOT NULL,
    scheduled_days INTEGER NOT NULL CHECK (scheduled_days >= 0),
    learning_steps INTEGER NOT NULL CHECK (learning_steps >= 0),
    reps INTEGER NOT NULL CHECK (reps >= 0),
    lapses INTEGER NOT NULL CHECK (lapses >= 0),
    last_review_at INTEGER,
    optimizer_revision_id TEXT NOT NULL REFERENCES learning_optimizer_revisions(revision_id),
    winning_event_id TEXT,
    state_hash TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS learning_states_due_idx
    ON learning_states(due_at, phase);

  CREATE TABLE IF NOT EXISTS learning_review_events (
    event_id TEXT PRIMARY KEY,
    target_id TEXT NOT NULL REFERENCES learning_targets(target_id) ON DELETE CASCADE,
    card_id TEXT NOT NULL,
    note_id TEXT NOT NULL,
    event_kind TEXT NOT NULL CHECK (event_kind IN ('rating', 'reset', 'undo')),
    rating TEXT CHECK (rating IN ('again', 'hard', 'good', 'easy')),
    occurred_at INTEGER NOT NULL,
    response_milliseconds INTEGER CHECK (response_milliseconds IS NULL OR response_milliseconds >= 0),
    scheduled_days INTEGER CHECK (scheduled_days IS NULL OR scheduled_days >= 0),
    elapsed_days INTEGER CHECK (elapsed_days IS NULL OR elapsed_days >= 0),
    base_event_id TEXT,
    undoes_event_id TEXT,
    reset_epoch TEXT,
    result_state_json TEXT,
    device_id TEXT NOT NULL,
    device_sequence INTEGER NOT NULL CHECK (device_sequence > 0),
    server_sequence INTEGER NOT NULL DEFAULT -1,
    fsrs_version TEXT NOT NULL,
    CHECK (
      (event_kind = 'rating' AND rating IS NOT NULL AND undoes_event_id IS NULL)
      OR (event_kind = 'undo' AND rating IS NULL AND undoes_event_id IS NOT NULL)
      OR (event_kind = 'reset' AND rating IS NULL AND reset_epoch IS NOT NULL)
    )
  );

  CREATE UNIQUE INDEX IF NOT EXISTS learning_review_event_device_sequence_idx
    ON learning_review_events(device_id, device_sequence);

  CREATE INDEX IF NOT EXISTS learning_review_event_target_time_idx
    ON learning_review_events(target_id, occurred_at, event_id);

  CREATE INDEX IF NOT EXISTS learning_review_event_kind_time_idx
    ON learning_review_events(event_kind, occurred_at);

  CREATE INDEX IF NOT EXISTS learning_review_event_card_time_idx
    ON learning_review_events(card_id, occurred_at);

  CREATE INDEX IF NOT EXISTS learning_review_event_undoes_idx
    ON learning_review_events(undoes_event_id);

  CREATE TABLE IF NOT EXISTS learning_sibling_bury_events (
    source_event_id TEXT PRIMARY KEY REFERENCES learning_review_events(event_id) ON DELETE CASCADE,
    source_card_id TEXT NOT NULL,
    note_id TEXT NOT NULL,
    source_block_id TEXT NOT NULL,
    source_queue TEXT NOT NULL CHECK (source_queue IN ('intraday-learning', 'interday-learning', 'review', 'new')),
    occurred_at INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS learning_sibling_bury_event_group_idx
    ON learning_sibling_bury_events(note_id, source_block_id, occurred_at);

  CREATE INDEX IF NOT EXISTS learning_sibling_bury_event_time_idx
    ON learning_sibling_bury_events(occurred_at);

  CREATE TABLE IF NOT EXISTS learning_queue_exclusions (
    card_id TEXT NOT NULL REFERENCES learning_cards(card_id) ON DELETE CASCADE,
    reason TEXT NOT NULL CHECK (reason IN ('manual_skip', 'partial_parent', 'sibling_bury')),
    until_at INTEGER NOT NULL,
    source_event_id TEXT,
    PRIMARY KEY (card_id, reason)
  );

  CREATE INDEX IF NOT EXISTS learning_queue_exclusions_until_idx
    ON learning_queue_exclusions(until_at);

  CREATE TABLE IF NOT EXISTS learning_sync_state (
    singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
    device_id TEXT NOT NULL,
    next_device_sequence INTEGER NOT NULL CHECK (next_device_sequence > 0),
    last_server_sequence INTEGER NOT NULL CHECK (last_server_sequence >= 0),
    schema_generation INTEGER NOT NULL CHECK (schema_generation > 0)
  );

  CREATE TABLE IF NOT EXISTS learning_sync_outbox (
    mutation_id TEXT PRIMARY KEY,
    entity_kind TEXT NOT NULL CHECK (entity_kind IN ('assignment', 'card', 'optimizer', 'review-event', 'tombstone')),
    entity_id TEXT NOT NULL,
    operation TEXT NOT NULL CHECK (operation IN ('upsert', 'delete')),
    payload_json TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS learning_sync_outbox_order_idx
    ON learning_sync_outbox(created_at, mutation_id);

  CREATE TABLE IF NOT EXISTS learning_sync_received_mutations (
    mutation_id TEXT PRIMARY KEY,
    source_device_id TEXT NOT NULL,
    source_sequence INTEGER NOT NULL CHECK (source_sequence > 0),
    received_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS learning_purge_tombstones (
    tombstone_id TEXT PRIMARY KEY,
    scope_kind TEXT NOT NULL CHECK (scope_kind IN ('card', 'optimizer', 'target')),
    scope_id TEXT NOT NULL,
    generation INTEGER NOT NULL CHECK (generation > 0),
    created_at INTEGER NOT NULL,
    server_sequence INTEGER NOT NULL DEFAULT -1
  );

  CREATE TABLE IF NOT EXISTS learning_maintenance_state (
    singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
    phase TEXT NOT NULL CHECK (phase = 'vacuum-pending'),
    archived_optimizers INTEGER NOT NULL CHECK (archived_optimizers >= 0),
    inactive_cards INTEGER NOT NULL CHECK (inactive_cards >= 0),
    review_events INTEGER NOT NULL CHECK (review_events >= 0),
    targets INTEGER NOT NULL CHECK (targets >= 0),
    created_at INTEGER NOT NULL
  );
`
