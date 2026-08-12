export interface AssetRow {
  byte_size: number
  created_at: number
  file_name: string
  mime_type: string
  original_file_name: string
}

export interface NoteRow {
  checkpoint_sequence: number
  checkpoint_snapshot: Uint8Array | null
  created_at: number
  id: string
  latest_sequence: number
  row_id: number
  title: string
  updated_at: number
}

export interface JournalMetadataRow {
  has_user_content: number
  journal_date: string
  note_id: string
}

export interface AssetStatisticsRow {
  managed_asset_count: number
  reference_count: number
}

export interface NoteUpdateRow {
  sequence: number
  update_blob: Uint8Array
}

export interface NoteUpdateHashRow {
  update_hash: string
}

export interface ExistingEntryRow {
  entry_id: string
}

export interface ExistingTopicRow {
  topic_id: string
}

export interface ExistingBlockRow {
  block_id: string
  content_hash: string
  row_id: number
  topic_id: string
}

export interface BookTopicContextRow {
  authors_json: string
  byte_length: number
  content_hash: string
  format: string
  note_id: string
  note_title: string
  original_name: string
  publication_title: string
  retrieval_hints_json: string
  topic_id: string
  topic_title: string
}
