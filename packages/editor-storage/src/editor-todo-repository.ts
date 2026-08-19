import type { EditorStorageDatabase, StorageOperationRunner } from './database-driver'
import type {
  EditorTodoStorage,
  ListTodoTasksInput,
  TodoReminder,
  TodoRepeatRule,
  TodoTask,
  TodoTaskPage,
  TodoTaskStatus,
} from './editor-storage-contracts'
import { resolveLimit } from './editor-storage-shared'

interface TodoTaskRow {
  all_day: number | null
  block_id: string
  due_date: string | null
  due_time: string | null
  end_at: string | null
  elapsed_ms: number | null
  journal_date: string | null
  note_id: string
  note_favorite: number
  note_title: string
  parent_block_id: string | null
  repeat_rule: string | null
  reminder_minutes: number | null
  reminders: string | null
  start_at: string | null
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

function readReminders(value: string | null, blockId: string): readonly TodoReminder[] | null {
  if (value === null)
    return null
  let parsed: unknown
  try {
    parsed = JSON.parse(value)
  }
  catch (error) {
    throw new TypeError(`Stored Todo task ${blockId} has invalid reminders`, { cause: error })
  }
  if (!Array.isArray(parsed) || parsed.length > 8)
    throw new TypeError(`Stored Todo task ${blockId} has invalid reminders`)
  const reminders: TodoReminder[] = []
  for (const item of parsed) {
    if (typeof item !== 'object' || item === null)
      throw new TypeError(`Stored Todo task ${blockId} has invalid reminders`)
    const candidate = item as Record<string, unknown>
    if (candidate.kind === 'offset'
      && typeof candidate.minutes === 'number'
      && Number.isSafeInteger(candidate.minutes)
      && candidate.minutes >= 0
      && candidate.minutes <= 10080) {
      reminders.push({ kind: 'offset', minutes: candidate.minutes })
      continue
    }
    if (candidate.kind === 'time'
      && typeof candidate.time === 'string'
      && /^(?:[01]\d|2[0-3]):[0-5]\d$/u.test(candidate.time)) {
      reminders.push({ kind: 'time', time: candidate.time })
      continue
    }
    throw new TypeError(`Stored Todo task ${blockId} has invalid reminders`)
  }
  if (new Set(reminders.map(reminder => JSON.stringify(reminder))).size !== reminders.length)
    throw new TypeError(`Stored Todo task ${blockId} has duplicate reminders`)
  return reminders
}

function toTodoTask(row: TodoTaskRow): TodoTask {
  if (row.status !== 'todo' && row.status !== 'doing' && row.status !== 'done')
    throw new TypeError(`Stored Todo task ${row.block_id} has an invalid status`)
  if (row.block_id.length === 0 || row.note_id.length === 0 || row.topic_id.length === 0)
    throw new TypeError(`Stored Todo task ${row.block_id} has an invalid identity`)
  if (row.note_favorite !== 0 && row.note_favorite !== 1)
    throw new TypeError(`Stored Todo task ${row.block_id} has an invalid note favorite flag`)
  if (row.all_day !== null && row.all_day !== 0 && row.all_day !== 1)
    throw new TypeError(`Stored Todo task ${row.block_id} has an invalid all-day flag`)
  if (row.journal_date !== null && !/^\d{4}-\d{2}-\d{2}$/u.test(row.journal_date))
    throw new TypeError(`Stored Todo task ${row.block_id} has an invalid journal date`)
  const dueDate = row.due_date === null ? null : row.due_date
  if (dueDate !== null && !/^\d{4}-\d{2}-\d{2}$/u.test(dueDate))
    throw new TypeError(`Stored Todo task ${row.block_id} has an invalid due date`)
  if (row.due_time !== null && !/^(?:[01]\d|2[0-3]):[0-5]\d$/u.test(row.due_time))
    throw new TypeError(`Stored Todo task ${row.block_id} has an invalid due time`)
  if (row.start_at !== null && !/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d$/u.test(row.start_at))
    throw new TypeError(`Stored Todo task ${row.block_id} has an invalid start time`)
  if (row.end_at !== null && !/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d$/u.test(row.end_at))
    throw new TypeError(`Stored Todo task ${row.block_id} has an invalid end time`)
  if (row.reminder_minutes !== null
    && (!Number.isSafeInteger(row.reminder_minutes) || row.reminder_minutes < 0 || row.reminder_minutes > 10080)) {
    throw new TypeError(`Stored Todo task ${row.block_id} has an invalid reminder`)
  }
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
    if ((candidate.mode !== 'due' && candidate.mode !== 'completion' && candidate.mode !== 'custom')
      || (candidate.unit !== 'day' && candidate.unit !== 'week' && candidate.unit !== 'month' && candidate.unit !== 'year' && candidate.unit !== 'holiday' && candidate.unit !== 'lunar')
      || typeof candidate.interval !== 'number'
      || !Number.isSafeInteger(candidate.interval)
      || candidate.interval < 1
      || candidate.interval > 999) {
      throw new TypeError(`Stored Todo task ${row.block_id} has invalid repeat metadata`)
    }
    if (candidate.calendarId !== undefined && (typeof candidate.calendarId !== 'string' || candidate.calendarId.length === 0))
      throw new TypeError(`Stored Todo task ${row.block_id} has invalid repeat calendar`)
    if (candidate.anchorDate !== undefined && (typeof candidate.anchorDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(candidate.anchorDate)))
      throw new TypeError(`Stored Todo task ${row.block_id} has invalid repeat anchor date`)
    if (candidate.mode === 'custom' && candidate.anchorDate === undefined)
      throw new TypeError(`Stored Todo task ${row.block_id} has invalid custom repeat anchor date`)
    if (candidate.endDate !== undefined && (typeof candidate.endDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(candidate.endDate)))
      throw new TypeError(`Stored Todo task ${row.block_id} has invalid repeat end date`)
    if (candidate.holidayPolicy !== undefined
      && candidate.holidayPolicy !== 'allow'
      && candidate.holidayPolicy !== 'skip'
      && candidate.holidayPolicy !== 'next-workday') {
      throw new TypeError(`Stored Todo task ${row.block_id} has invalid holiday policy`)
    }
    if (candidate.weekdays !== undefined
      && (!Array.isArray(candidate.weekdays)
        || candidate.weekdays.some(day => typeof day !== 'number' || !Number.isInteger(day) || day < 0 || day > 6))) {
      throw new TypeError(`Stored Todo task ${row.block_id} has invalid repeat weekdays`)
    }
    if (candidate.monthMode !== undefined && candidate.monthMode !== 'date' && candidate.monthMode !== 'weekday' && candidate.monthMode !== 'workday')
      throw new TypeError(`Stored Todo task ${row.block_id} has invalid repeat month mode`)
    if (candidate.yearMode !== undefined && candidate.yearMode !== 'date' && candidate.yearMode !== 'weekday')
      throw new TypeError(`Stored Todo task ${row.block_id} has invalid repeat year mode`)
    const validOrdinal = (value: unknown): boolean => value === -1 || value === 1 || value === 2 || value === 3 || value === 4 || value === 5
    if (candidate.monthOrdinal !== undefined && !validOrdinal(candidate.monthOrdinal))
      throw new TypeError(`Stored Todo task ${row.block_id} has invalid repeat month ordinal`)
    if (candidate.yearOrdinal !== undefined && !validOrdinal(candidate.yearOrdinal))
      throw new TypeError(`Stored Todo task ${row.block_id} has invalid repeat year ordinal`)
    const validDay = (value: unknown): boolean => value === 'last' || (typeof value === 'number' && Number.isSafeInteger(value) && value >= 1 && value <= 31)
    if (candidate.monthDay !== undefined && !validDay(candidate.monthDay))
      throw new TypeError(`Stored Todo task ${row.block_id} has invalid repeat month day`)
    if (candidate.yearDay !== undefined && !validDay(candidate.yearDay))
      throw new TypeError(`Stored Todo task ${row.block_id} has invalid repeat year day`)
    const validMonth = (value: unknown): boolean => typeof value === 'number' && Number.isSafeInteger(value) && value >= 1 && value <= 12
    if (candidate.yearMonth !== undefined && !validMonth(candidate.yearMonth))
      throw new TypeError(`Stored Todo task ${row.block_id} has invalid repeat year month`)
    if (candidate.lunarMonth !== undefined && !validMonth(candidate.lunarMonth))
      throw new TypeError(`Stored Todo task ${row.block_id} has invalid repeat lunar month`)
    if (candidate.lunarDay !== undefined && (typeof candidate.lunarDay !== 'number' || !Number.isSafeInteger(candidate.lunarDay) || candidate.lunarDay < 1 || candidate.lunarDay > 30))
      throw new TypeError(`Stored Todo task ${row.block_id} has invalid repeat lunar day`)
    if (candidate.unit === 'lunar' && (candidate.lunarMonth === undefined || candidate.lunarDay === undefined))
      throw new TypeError(`Stored Todo task ${row.block_id} has invalid lunar repeat date`)
    if (candidate.monthWeekday !== undefined && (typeof candidate.monthWeekday !== 'number' || !Number.isInteger(candidate.monthWeekday) || candidate.monthWeekday < 0 || candidate.monthWeekday > 6))
      throw new TypeError(`Stored Todo task ${row.block_id} has invalid repeat month weekday`)
    if (candidate.yearWeekday !== undefined && (typeof candidate.yearWeekday !== 'number' || !Number.isInteger(candidate.yearWeekday) || candidate.yearWeekday < 0 || candidate.yearWeekday > 6))
      throw new TypeError(`Stored Todo task ${row.block_id} has invalid repeat year weekday`)
    if (candidate.skipHolidays !== undefined && typeof candidate.skipHolidays !== 'boolean')
      throw new TypeError(`Stored Todo task ${row.block_id} has invalid repeat holiday skip`)
    if (candidate.skipWeekends !== undefined && typeof candidate.skipWeekends !== 'boolean')
      throw new TypeError(`Stored Todo task ${row.block_id} has invalid repeat weekend skip`)
    if ((candidate.unit === 'holiday' || candidate.skipHolidays === true || (candidate.holidayPolicy !== undefined && candidate.holidayPolicy !== 'allow'))
      && typeof candidate.calendarId !== 'string') {
      throw new TypeError(`Stored Todo task ${row.block_id} has invalid holiday repeat calendar`)
    }
    repeatRule = structuredClone(candidate) as unknown as TodoRepeatRule
  }
  return {
    allDay: row.all_day === 1,
    blockId: row.block_id,
    dueDate,
    dueTime: row.due_time,
    endAt: row.end_at,
    elapsedMs: readFiniteNumber(row.elapsed_ms, 'elapsedMs', false),
    journalDate: row.journal_date,
    noteId: row.note_id,
    noteFavorite: row.note_favorite === 1,
    noteTitle: row.note_title,
    parentId: row.parent_block_id,
    repeatRule,
    reminderMinutes: row.reminder_minutes,
    reminders: readReminders(row.reminders, row.block_id),
    startAt: row.start_at,
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
          COALESCE(json_extract(block.attributes_json, '$.allDay'), 0) AS all_day,
          json_extract(block.attributes_json, '$.dueTime') AS due_time,
          json_extract(block.attributes_json, '$.endAt') AS end_at,
          json_extract(block.attributes_json, '$.elapsedMs') AS elapsed_ms,
          json_extract(block.attributes_json, '$.startedAt') AS started_at,
          json_extract(block.attributes_json, '$.status') AS status,
          json_extract(block.attributes_json, '$.repeatRule') AS repeat_rule,
          json_extract(block.attributes_json, '$.reminderMinutes') AS reminder_minutes,
          json_extract(block.attributes_json, '$.reminders') AS reminders,
          json_extract(block.attributes_json, '$.startAt') AS start_at,
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
