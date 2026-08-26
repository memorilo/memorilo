import type { DatabaseCommand, EditorStorageDatabase, StorageOperationRunner } from '../database-driver'
import type { LearningReadingItemStorage, ProcessReadingItemInput, ReadingItem, ReadingItemProjection } from './types'
import { assertNonEmpty } from './learning-storage-shared'

interface ReadingItemRow extends ReadingItem {
  next_process_at: number | null
  note_id: string
  priority: number
  read_point: number
  reading_item_id: string
  source_block_id: string
  state: ReadingItem['state']
  topic_id: string
  highlight_id: string
}

function mapRow(row: ReadingItemRow): ReadingItem {
  return {
    highlightId: row.highlight_id,
    nextProcessAt: row.next_process_at,
    noteId: row.note_id,
    priority: row.priority,
    readPoint: row.read_point,
    readingItemId: row.reading_item_id,
    sourceBlockId: row.source_block_id,
    state: row.state,
    topicId: row.topic_id,
  }
}

export class LearningReadingItemRepository implements LearningReadingItemStorage {
  readonly #database: EditorStorageDatabase
  readonly #runOperation: StorageOperationRunner

  constructor(database: EditorStorageDatabase, runOperation: StorageOperationRunner) {
    this.#database = database
    this.#runOperation = runOperation
  }

  async planReconciliation(noteId: string, topicId: string, items: readonly ReadingItemProjection[]): Promise<readonly DatabaseCommand[]> {
    const now = Date.now()
    const commands: DatabaseCommand[] = []
    const ids = new Set<string>()
    for (const item of items) {
      assertNonEmpty(item.readingItemId, 'Reading Item id')
      assertNonEmpty(item.sourceBlockId, 'Source Block id')
      assertNonEmpty(item.highlightId, 'Highlight id')
      if (ids.has(item.readingItemId))
        throw new Error(`Duplicate Reading Item ${item.readingItemId}`)
      ids.add(item.readingItemId)
      commands.push({
        parameters: [item.readingItemId, noteId, topicId, item.sourceBlockId, item.highlightId, item.state ?? 'new', item.priority ?? null, item.nextProcessAt ?? null, item.readPoint ?? 0, now, now, item.priority ?? null],
        sql: `INSERT INTO learning_reading_items (reading_item_id, note_id, topic_id, source_block_id, highlight_id, state, priority, next_process_at, read_point, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, COALESCE(?, 0), ?, ?, ?, ?)
          ON CONFLICT(reading_item_id) DO UPDATE SET note_id = excluded.note_id, topic_id = excluded.topic_id, source_block_id = excluded.source_block_id, highlight_id = excluded.highlight_id, priority = COALESCE(?, learning_reading_items.priority), updated_at = excluded.updated_at`,
      })
    }
    commands.push({
      parameters: [noteId, topicId, ...(items.length ? [...ids] : ['__none__'])],
      sql: `DELETE FROM learning_reading_items WHERE note_id = ? AND topic_id = ? AND reading_item_id NOT IN (${items.length ? items.map(() => '?').join(',') : '?'})`,
    })
    return commands
  }

  async listTopics(noteId: string): Promise<readonly string[]> {
    const rows = await this.#database.all<{ topic_id: string }>('SELECT DISTINCT topic_id FROM learning_reading_items WHERE note_id = ?', [noteId])
    return rows.map(row => row.topic_id)
  }

  async reconcile(noteId: string, topicId: string, items: readonly ReadingItemProjection[]): Promise<void> {
    assertNonEmpty(noteId, 'Note id')
    assertNonEmpty(topicId, 'Topic id')
    return this.#runOperation(async () => {
      const commands = await this.planReconciliation(noteId, topicId, items)
      if (commands.length)
        await this.#database.batch(commands)
    })
  }

  list(input: { includeScheduled?: boolean, limit?: number, noteId?: string, now?: number, readingItemId?: string, topicId?: string } = {}): Promise<readonly ReadingItem[]> {
    return this.#runOperation(async () => {
      const now = input.now ?? Date.now()
      const conditions = input.includeScheduled === true ? ['1 = 1'] : ['(next_process_at IS NULL OR next_process_at <= ?)']
      const parameters: (number | string)[] = input.includeScheduled === true ? [] : [now]
      if (input.noteId) {
        conditions.push('note_id = ?')
        parameters.push(input.noteId)
      }
      if (input.topicId) {
        conditions.push('topic_id = ?')
        parameters.push(input.topicId)
      }
      if (input.readingItemId) {
        conditions.push('reading_item_id = ?')
        parameters.push(input.readingItemId)
      }
      const limit = input.limit ?? 50
      parameters.push(limit)
      const rows = await this.#database.all<ReadingItemRow>(`SELECT reading_item_id, note_id, topic_id, source_block_id, highlight_id, state, priority, next_process_at, read_point FROM learning_reading_items WHERE ${conditions.join(' AND ')} ORDER BY priority DESC, COALESCE(next_process_at, 0), reading_item_id LIMIT ?`, parameters)
      return rows.map(mapRow)
    })
  }

  process(input: ProcessReadingItemInput): Promise<ReadingItem> {
    assertNonEmpty(input.readingItemId, 'Reading Item id')
    return this.#runOperation(async () => {
      const now = input.processedAt ?? Date.now()
      const item = await this.#database.get<ReadingItemRow>('SELECT reading_item_id, note_id, topic_id, source_block_id, highlight_id, state, priority, next_process_at, read_point FROM learning_reading_items WHERE reading_item_id = ?', [input.readingItemId])
      if (!item)
        throw new Error(`Reading Item ${input.readingItemId} was not found`)
      const nextProcessAt = input.action === 'cloze' ? now + 86_400_000 : now + 300_000
      const readPoint = input.readPoint ?? item.read_point
      await this.#database.run('UPDATE learning_reading_items SET state = \'learning\', next_process_at = ?, read_point = ?, last_processed_at = ?, updated_at = ? WHERE reading_item_id = ?', [nextProcessAt, readPoint, now, now, input.readingItemId])
      return mapRow({ ...item, state: 'learning', next_process_at: nextProcessAt, read_point: readPoint })
    })
  }
}
