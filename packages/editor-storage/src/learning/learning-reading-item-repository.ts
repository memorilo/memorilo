import type { DatabaseCommand, EditorStorageDatabase, EditorStorageDrizzleDatabase, StorageOperationRunner } from '../database-driver'
import type { LearningReadingItemStorage, ProcessReadingItemInput, ReadingItem, ReadingItemProjection } from './types'
import { and, asc, desc, eq, isNull, lte, notInArray, or, sql } from 'drizzle-orm'
import { learningReadingItems } from '../drizzle-schema'
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
  readonly #orm: EditorStorageDrizzleDatabase
  readonly #runOperation: StorageOperationRunner

  constructor(database: EditorStorageDatabase, runOperation: StorageOperationRunner) {
    this.#database = database
    this.#orm = database.drizzle
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
      const priority = item.priority
      commands.push({
        drizzle: database => database.insert(learningReadingItems).values({
          createdAt: now,
          highlightId: item.highlightId,
          nextProcessAt: item.nextProcessAt ?? null,
          noteId,
          priority: priority ?? 0,
          readPoint: item.readPoint ?? 0,
          readingItemId: item.readingItemId,
          sourceBlockId: item.sourceBlockId,
          state: item.state ?? 'new',
          topicId,
          updatedAt: now,
        }).onConflictDoUpdate({
          set: {
            highlightId: item.highlightId,
            noteId,
            ...(priority === undefined ? {} : { priority }),
            sourceBlockId: item.sourceBlockId,
            topicId,
            updatedAt: now,
          },
          target: learningReadingItems.readingItemId,
        }).run(),
      })
    }
    commands.push({
      drizzle: database => database.delete(learningReadingItems).where(and(
        eq(learningReadingItems.noteId, noteId),
        eq(learningReadingItems.topicId, topicId),
        ids.size === 0 ? undefined : notInArray(learningReadingItems.readingItemId, [...ids]),
      )).run(),
    })
    return commands
  }

  async listTopics(noteId: string): Promise<readonly string[]> {
    const rows = this.#orm.selectDistinct({ topic_id: learningReadingItems.topicId }).from(learningReadingItems).where(eq(learningReadingItems.noteId, noteId)).all()
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
      const limit = input.limit ?? 50
      const conditions = [
        input.includeScheduled === true ? undefined : or(isNull(learningReadingItems.nextProcessAt), lte(learningReadingItems.nextProcessAt, now)),
        input.noteId === undefined ? undefined : eq(learningReadingItems.noteId, input.noteId),
        input.topicId === undefined ? undefined : eq(learningReadingItems.topicId, input.topicId),
        input.readingItemId === undefined ? undefined : eq(learningReadingItems.readingItemId, input.readingItemId),
      ]
      const rows = this.#orm.select({
        reading_item_id: learningReadingItems.readingItemId,
        note_id: learningReadingItems.noteId,
        topic_id: learningReadingItems.topicId,
        source_block_id: learningReadingItems.sourceBlockId,
        highlight_id: learningReadingItems.highlightId,
        state: learningReadingItems.state,
        priority: learningReadingItems.priority,
        next_process_at: learningReadingItems.nextProcessAt,
        read_point: learningReadingItems.readPoint,
      }).from(learningReadingItems).where(and(...conditions)).orderBy(desc(learningReadingItems.priority), asc(sql`coalesce(${learningReadingItems.nextProcessAt}, 0)`), asc(learningReadingItems.readingItemId)).limit(limit).all() as ReadingItemRow[]
      return rows.map(mapRow)
    })
  }

  process(input: ProcessReadingItemInput): Promise<ReadingItem> {
    assertNonEmpty(input.readingItemId, 'Reading Item id')
    return this.#runOperation(async () => {
      const now = input.processedAt ?? Date.now()
      const item = this.#orm.select({
        reading_item_id: learningReadingItems.readingItemId,
        note_id: learningReadingItems.noteId,
        topic_id: learningReadingItems.topicId,
        source_block_id: learningReadingItems.sourceBlockId,
        highlight_id: learningReadingItems.highlightId,
        state: learningReadingItems.state,
        priority: learningReadingItems.priority,
        next_process_at: learningReadingItems.nextProcessAt,
        read_point: learningReadingItems.readPoint,
      }).from(learningReadingItems).where(eq(learningReadingItems.readingItemId, input.readingItemId)).get() as ReadingItemRow | undefined
      if (!item)
        throw new Error(`Reading Item ${input.readingItemId} was not found`)
      const nextProcessAt = input.action === 'cloze' ? now + 86_400_000 : now + 300_000
      const readPoint = input.readPoint ?? item.read_point
      this.#orm.update(learningReadingItems).set({ state: 'learning', nextProcessAt, readPoint, lastProcessedAt: now, updatedAt: now }).where(eq(learningReadingItems.readingItemId, input.readingItemId)).run()
      return mapRow({ ...item, state: 'learning', next_process_at: nextProcessAt, read_point: readPoint })
    })
  }
}
