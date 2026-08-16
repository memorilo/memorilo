import type { EditorStorageDatabase, StorageOperationRunner } from './database-driver'
import type {
  EditorTodoStorage,
  ListTodoTasksInput,
  TodoRepeatRule,
  TodoTask,
  TodoTaskPage,
  TodoTaskStatus,
} from './editor-storage-contracts'
import { resolveLimit } from './editor-storage-shared'

interface TodoTaskRow {
  block_id: string
  due_date: string | null
  elapsed_ms: number | null
  journal_date: string | null
  note_id: string
  note_favorite: number
  note_title: string
  parent_block_id: string | null
  repeat_rule: string | null
  started_at: number | null
  status: string | null
  text: string
  topic_id: string
  topic_title: string
  task_row_id: number
}

interface EditorTodoRepositoryOptions {
  database: EditorStorageDatabase
  runOperation: StorageOperationRunner
}

function resolveCursor(cursor: number | undefined): number | null {
  if (cursor === undefined)
    return null
  if (!Number.isSafeInteger(cursor) || cursor < 1)
    throw new RangeError('Todo task cursor must be a positive safe integer')
  return cursor
}

function resolveStatus(status: TodoTaskStatus | undefined): TodoTaskStatus | null {
  if (status === undefined)
    return null
  if (status !== 'todo' && status !== 'doing' && status !== 'done')
    throw new TypeError(`Unknown Todo task status: ${String(status)}`)
  return status
}

function readFiniteNumber(value: number | null, name: string, allowNull: true): number | null
function readFiniteNumber(value: number | null, name: string, allowNull: false): number
function readFiniteNumber(value: number | null, name: string, allowNull: boolean): number | null {
  if (value === null && allowNull)
    return null
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0)
    throw new TypeError(`Stored Todo task ${name} must be a non-negative finite number`)
  return value
}

function toTodoTask(row: TodoTaskRow): TodoTask {
  if (row.status !== 'todo' && row.status !== 'doing' && row.status !== 'done')
    throw new TypeError(`Stored Todo task ${row.block_id} has an invalid status`)
  if (row.block_id.length === 0 || row.note_id.length === 0 || row.topic_id.length === 0)
    throw new TypeError(`Stored Todo task ${row.block_id} has an invalid identity`)
  if (row.note_favorite !== 0 && row.note_favorite !== 1)
    throw new TypeError(`Stored Todo task ${row.block_id} has an invalid note favorite flag`)
  if (row.journal_date !== null && !/^\d{4}-\d{2}-\d{2}$/u.test(row.journal_date))
    throw new TypeError(`Stored Todo task ${row.block_id} has an invalid journal date`)
  const dueDate = row.due_date === null ? null : row.due_date
  if (dueDate !== null && !/^\d{4}-\d{2}-\d{2}$/u.test(dueDate))
    throw new TypeError(`Stored Todo task ${row.block_id} has an invalid due date`)
  let repeatRule: TodoRepeatRule | null = null
  if (row.repeat_rule !== null) {
    let parsed: unknown
    try {
      parsed = JSON.parse(row.repeat_rule)
    }
    catch (error) {
      throw new TypeError(`Stored Todo task ${row.block_id} has invalid repeat metadata`, { cause: error })
    }
    if (parsed === null || typeof parsed !== 'object')
      throw new TypeError(`Stored Todo task ${row.block_id} has invalid repeat metadata`)
    const candidate = parsed as Record<string, unknown>
    if ((candidate.mode !== 'due' && candidate.mode !== 'completion')
      || (candidate.unit !== 'day' && candidate.unit !== 'week' && candidate.unit !== 'month' && candidate.unit !== 'year' && candidate.unit !== 'holiday')
      || typeof candidate.interval !== 'number'
      || !Number.isSafeInteger(candidate.interval)
      || candidate.interval < 1
      || candidate.interval > 999) {
      throw new TypeError(`Stored Todo task ${row.block_id} has invalid repeat metadata`)
    }
    if (candidate.calendarId !== undefined && (typeof candidate.calendarId !== 'string' || candidate.calendarId.length === 0))
      throw new TypeError(`Stored Todo task ${row.block_id} has invalid repeat calendar`)
    if (candidate.unit === 'holiday' && typeof candidate.calendarId !== 'string')
      throw new TypeError(`Stored Todo task ${row.block_id} has invalid holiday repeat calendar`)
    repeatRule = structuredClone(candidate) as unknown as TodoRepeatRule
  }
  return {
    blockId: row.block_id,
    dueDate,
    elapsedMs: readFiniteNumber(row.elapsed_ms, 'elapsedMs', false),
    journalDate: row.journal_date,
    noteId: row.note_id,
    noteFavorite: row.note_favorite === 1,
    noteTitle: row.note_title,
    parentId: row.parent_block_id,
    repeatRule,
    startedAt: readFiniteNumber(row.started_at, 'startedAt', true),
    status: row.status,
    text: row.text,
    topicId: row.topic_id,
    topicTitle: row.topic_title,
  }
}

export class EditorTodoRepository implements EditorTodoStorage {
  readonly #options: EditorTodoRepositoryOptions

  constructor(options: EditorTodoRepositoryOptions) {
    this.#options = options
  }

  readonly list = (input: ListTodoTasksInput = {}): Promise<TodoTaskPage> => {
    const cursor = resolveCursor(input.cursor)
    const limit = resolveLimit(input.limit, 100, 500)
    const status = resolveStatus(input.status)
    const cursorPredicate = cursor === null ? '' : 'AND block.row_id < ?'
    const statusPredicate = status === null ? '' : `AND json_extract(block.attributes_json, '$.status') = ?`
    const parameters = [
      ...(cursor === null ? [] : [cursor]),
      ...(status === null ? [] : [status]),
      limit + 1,
    ]

    return this.#options.runOperation(async () => {
      const rows = await this.#options.database.all<TodoTaskRow>(`
        SELECT
          block.row_id AS task_row_id,
          block.block_id,
          block.parent_block_id,
          block.text,
          json_extract(block.attributes_json, '$.dueDate') AS due_date,
          json_extract(block.attributes_json, '$.elapsedMs') AS elapsed_ms,
          json_extract(block.attributes_json, '$.startedAt') AS started_at,
          json_extract(block.attributes_json, '$.status') AS status,
          json_extract(block.attributes_json, '$.repeatRule') AS repeat_rule,
          journal.journal_date,
          note.id AS note_id,
          CASE WHEN favorite.note_row_id IS NULL THEN 0 ELSE 1 END AS note_favorite,
          note.title AS note_title,
          topic.topic_id,
          topic.title AS topic_title
        FROM topic_blocks AS block
        INNER JOIN notes AS note ON note.row_id = block.note_row_id
        LEFT JOIN journals AS journal ON journal.note_row_id = note.row_id
        LEFT JOIN note_favorites AS favorite ON favorite.note_row_id = note.row_id
        INNER JOIN topics AS topic
          ON topic.note_row_id = block.note_row_id AND topic.topic_id = block.topic_id
        WHERE block.kind = 'task'
          ${cursorPredicate}
          ${statusPredicate}
        ORDER BY block.row_id DESC
        LIMIT ?
      `, parameters)
      const hasMore = rows.length > limit
      const pageRows = hasMore ? rows.slice(0, limit) : rows
      const items = pageRows.map(toTodoTask)
      const lastRow = pageRows.at(-1)
      if (hasMore && lastRow && !Number.isSafeInteger(lastRow.task_row_id))
        throw new RangeError('Stored Todo task row id exceeds the safe cursor range')
      return {
        items,
        nextCursor: hasMore
          ? (() => {
              if (!lastRow)
                throw new Error('Todo task page marked as continuing without a last row')
              return lastRow.task_row_id
            })()
          : null,
      }
    })
  }
}
