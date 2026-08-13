import type { DatabaseCommand } from './database-driver'
import type {
  NoteEntryProjection,
  TopicContentProjection,
  TopicProjection,
} from './editor-storage-contracts'
import { contentHash } from './editor-storage-validation'

type NoteProjectionTarget
  = | { noteId: string }
    | { noteRowId: number }

interface NoteProjectionPlan {
  blocks: ReadonlyMap<string, { hash: string }>
  commands: readonly DatabaseCommand[]
  entryIds: ReadonlySet<string>
  topicIds: ReadonlySet<string>
}

type ProjectionWriteMode = 'insert' | 'upsert'

function blockKey(topicId: string, blockId: string): string {
  return `${topicId}\0${blockId}`
}

/**
 * Plans the normalized Note projection for both initial creation and updates.
 * Callers own transaction ordering; this module owns the shared SQLite shape.
 */
function planNoteProjection(
  target: NoteProjectionTarget,
  entries: readonly NoteEntryProjection[] | undefined,
  topics: readonly TopicContentProjection[],
  mode: ProjectionWriteMode,
): NoteProjectionPlan {
  const noteParameter = 'noteId' in target ? target.noteId : target.noteRowId
  const noteRowSql = 'noteId' in target ? '(SELECT row_id FROM notes WHERE id = ?)' : '?'
  const commands: DatabaseCommand[] = []
  const entryIds = new Set((entries ?? []).map(entry => entry.id))
  const topicEntries = new Map((entries ?? [])
    .filter((entry): entry is TopicProjection => entry.kind === 'topic')
    .map(entry => [entry.id, entry]))
  const topicIds = new Set(topicEntries.keys())
  const blocks = new Map<string, { hash: string }>()

  for (const entry of entries ?? []) {
    commands.push({
      parameters: [
        noteParameter,
        entry.id,
        entry.parentId,
        entry.ordinal,
        entry.kind,
        entry.kind === 'folder' ? entry.name : entry.title,
      ],
      sql: `
        INSERT INTO note_entries (
          note_row_id, entry_id, parent_entry_id, ordinal, kind, label
        ) VALUES (${noteRowSql}, ?, ?, ?, ?, ?)
        ${mode === 'upsert'
          ? `ON CONFLICT(note_row_id, entry_id) DO UPDATE SET
              parent_entry_id = excluded.parent_entry_id,
              ordinal = excluded.ordinal,
              kind = excluded.kind,
              label = excluded.label`
          : ''}
      `,
    })
  }

  for (const entry of topicEntries.values()) {
    commands.push({
      parameters: [
        noteParameter,
        entry.id,
        entry.topicType,
        entry.topicType === 'whiteboard' ? null : entry.mode,
        entry.title,
      ],
      sql: `
        INSERT INTO topics (note_row_id, topic_id, topic_type, editor_mode, title)
        VALUES (${noteRowSql}, ?, ?, ?, ?)
        ${mode === 'upsert'
          ? `ON CONFLICT(note_row_id, topic_id) DO UPDATE SET
              topic_type = excluded.topic_type,
              editor_mode = excluded.editor_mode,
              title = excluded.title`
          : ''}
      `,
    })
  }

  if (mode === 'upsert' && entries !== undefined) {
    commands.push({
      parameters: [noteParameter],
      sql: `DELETE FROM book_topics WHERE note_row_id = ${noteRowSql}`,
    })
  }
  for (const entry of topicEntries.values()) {
    if (entry.topicType !== 'book')
      continue
    commands.push({
      parameters: [
        noteParameter,
        entry.id,
        entry.book.file.format,
        entry.book.file.sha256,
        entry.book.file.byteLength,
        entry.book.file.originalName,
        entry.book.book.title,
        JSON.stringify(entry.book.book.authors),
        JSON.stringify(entry.book.retrievalHints),
      ],
      sql: `
        INSERT INTO book_topics (
          note_row_id,
          topic_id,
          format,
          content_hash,
          byte_length,
          original_name,
          publication_title,
          authors_json,
          retrieval_hints_json
        ) VALUES (${noteRowSql}, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
    })
  }

  if (mode === 'upsert') {
    for (const topic of topics) {
      commands.push(
        {
          parameters: [topic.title, noteParameter, topic.topicId],
          sql: `UPDATE topics SET title = ? WHERE note_row_id = ${noteRowSql} AND topic_id = ?`,
        },
        {
          parameters: [topic.title, noteParameter, topic.topicId],
          sql: `UPDATE note_entries SET label = ? WHERE note_row_id = ${noteRowSql} AND entry_id = ?`,
        },
      )
    }
  }

  for (const topic of topics) {
    for (const block of topic.blocks) {
      const hash = contentHash(block.text)
      blocks.set(blockKey(topic.topicId, block.id), { hash })
      commands.push({
        parameters: [
          noteParameter,
          topic.topicId,
          block.id,
          block.parentId,
          block.ordinal,
          block.kind,
          block.text,
          JSON.stringify(block.attributes),
          hash,
        ],
        sql: `
          INSERT INTO topic_blocks (
            note_row_id,
            topic_id,
            block_id,
            parent_block_id,
            ordinal,
            kind,
            text,
            attributes_json,
            content_hash
          ) VALUES (${noteRowSql}, ?, ?, ?, ?, ?, ?, ?, ?)
          ${mode === 'upsert'
            ? `ON CONFLICT(note_row_id, topic_id, block_id) DO UPDATE SET
                parent_block_id = excluded.parent_block_id,
                ordinal = excluded.ordinal,
                kind = excluded.kind,
                text = excluded.text,
                attributes_json = excluded.attributes_json,
                content_hash = excluded.content_hash`
            : ''}
        `,
      })
    }
  }

  return { blocks, commands, entryIds, topicIds }
}

export function planInitializedNoteProjection(
  noteId: string,
  entries: readonly NoteEntryProjection[],
  topics: readonly TopicContentProjection[],
): NoteProjectionPlan {
  return planNoteProjection({ noteId }, entries, topics, 'insert')
}

export function planUpdatedNoteProjection(
  noteRowId: number,
  entries: readonly NoteEntryProjection[] | undefined,
  topics: readonly TopicContentProjection[],
): NoteProjectionPlan {
  return planNoteProjection({ noteRowId }, entries, topics, 'upsert')
}
