import type { EditorStorageDatabase, StorageOperationRunner } from './database-driver'
import type {
  EditorTodoCalendarStorage,
  SaveTodoCalendarSnapshotInput,
  TodoCalendarEvent,
  TodoCalendarSubscription,
} from './editor-storage-contracts'

interface SubscriptionRow {
  etag: string | null
  enabled: number
  fetched_at: number | null
  id: string
  title: string
  url: string
  version: string | null
  last_modified: string | null
}

interface EventRow {
  all_day: number
  end_date: string | null
  end_at: string | null
  start_date: string
  start_at: string | null
  subscription_id: string
  subscription_title: string
  title: string
  uid: string
}

interface EditorTodoCalendarRepositoryOptions {
  database: EditorStorageDatabase
  runOperation: StorageOperationRunner
}

const journalDatePattern = /^\d{4}-\d{2}-\d{2}$/u

function assertDate(value: string, name: string): void {
  if (!journalDatePattern.test(value))
    throw new TypeError(`${name} must be an ISO journal date`)
}

function toSubscription(row: SubscriptionRow): TodoCalendarSubscription {
  if (row.enabled !== 0 && row.enabled !== 1)
    throw new TypeError(`Calendar ${row.id} has an invalid enabled flag`)
  return {
    etag: row.etag,
    enabled: row.enabled === 1,
    fetchedAt: row.fetched_at,
    id: row.id,
    title: row.title,
    url: row.url,
    version: row.version,
    lastModified: row.last_modified,
  }
}

function toEvent(row: EventRow): TodoCalendarEvent {
  assertDate(row.start_date, `Calendar event ${row.uid} start date`)
  if (row.end_date !== null)
    assertDate(row.end_date, `Calendar event ${row.uid} end date`)
  return {
    allDay: row.all_day === 1,
    endDate: row.end_date,
    endAt: row.end_at,
    startDate: row.start_date,
    startAt: row.start_at,
    subscriptionId: row.subscription_id,
    subscriptionTitle: row.subscription_title,
    title: row.title,
    uid: row.uid,
  }
}

export class EditorTodoCalendarRepository implements EditorTodoCalendarStorage {
  readonly #options: EditorTodoCalendarRepositoryOptions

  constructor(options: EditorTodoCalendarRepositoryOptions) {
    this.#options = options
  }

  readonly listSubscriptions = (): Promise<readonly TodoCalendarSubscription[]> => this.#options.runOperation(async () => {
    const rows = await this.#options.database.all<SubscriptionRow>(`
      SELECT id, url, title, enabled, version, fetched_at, etag, last_modified
      FROM todo_calendar_subscriptions
      ORDER BY title COLLATE NOCASE, id
    `)
    return rows.map(toSubscription)
  })

  readonly ensureSubscription = (input: { id: string, title: string, url: string }): Promise<void> => {
    if (input.id.length === 0 || input.title.length === 0 || input.url.length === 0)
      throw new TypeError('Calendar subscription identity must not be empty')
    return this.#options.runOperation(() => this.#options.database.run(`
      INSERT INTO todo_calendar_subscriptions (id, url, title, enabled)
      VALUES (?, ?, ?, 1)
      ON CONFLICT(id) DO NOTHING
    `, [input.id, input.url, input.title]))
  }

  readonly listEvents = (input: { from: string, through: string }): Promise<readonly TodoCalendarEvent[]> => {
    assertDate(input.from, 'Calendar event range start')
    assertDate(input.through, 'Calendar event range end')
    if (input.from > input.through)
      throw new RangeError('Calendar event range start must not be after the end')
    return this.#options.runOperation(async () => {
      const rows = await this.#options.database.all<EventRow>(`
        SELECT event.uid, event.start_date, event.end_date, event.start_at, event.end_at, event.all_day, event.title,
          event.subscription_id, subscription.title AS subscription_title
        FROM todo_calendar_events AS event
        INNER JOIN todo_calendar_subscriptions AS subscription
          ON subscription.id = event.subscription_id
         AND subscription.version = event.version
        WHERE subscription.enabled = 1
          AND event.start_date <= ?
          AND (event.end_date IS NULL OR event.end_date >= ?)
        ORDER BY event.start_date, event.uid
      `, [input.through, input.from])
      return rows.map(toEvent)
    })
  }

  readonly markFetched = (id: string, fetchedAt: number): Promise<void> => {
    if (id.length === 0)
      throw new TypeError('Calendar subscription id must not be empty')
    if (!Number.isSafeInteger(fetchedAt) || fetchedAt < 0)
      throw new RangeError('Calendar subscription fetchedAt must be a non-negative safe integer')
    return this.#options.runOperation(() => this.#options.database.run(
      'UPDATE todo_calendar_subscriptions SET fetched_at = ? WHERE id = ?',
      [fetchedAt, id],
    ))
  }

  readonly remove = (id: string): Promise<void> => {
    if (id.length === 0)
      throw new TypeError('Calendar subscription id must not be empty')
    return this.#options.runOperation(() => this.#options.database.run(
      'DELETE FROM todo_calendar_subscriptions WHERE id = ?',
      [id],
    ))
  }

  readonly saveSnapshot = (input: SaveTodoCalendarSnapshotInput): Promise<void> => {
    if (input.id.length === 0 || input.title.length === 0 || input.url.length === 0 || input.version.length === 0)
      throw new TypeError('Calendar subscription identity must not be empty')
    if (!Number.isSafeInteger(input.fetchedAt) || input.fetchedAt < 0)
      throw new RangeError('Calendar subscription fetchedAt must be a non-negative safe integer')
    for (const event of input.events) {
      if (event.uid.length === 0 || event.title.length === 0)
        throw new TypeError('Calendar event identity and title must not be empty')
      assertDate(event.startDate, `Calendar event ${event.uid} start date`)
      if (event.endDate !== null)
        assertDate(event.endDate, `Calendar event ${event.uid} end date`)
    }
    return this.#options.runOperation(() => this.#options.database.batch([
      {
        parameters: [input.id, input.url, input.title, 1, input.version, input.fetchedAt, input.etag ?? null, input.lastModified ?? null],
        sql: `
          INSERT INTO todo_calendar_subscriptions (id, url, title, enabled, version, fetched_at, etag, last_modified)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            url = excluded.url,
            title = excluded.title,
            version = excluded.version,
            fetched_at = excluded.fetched_at,
            etag = excluded.etag,
            last_modified = excluded.last_modified
        `,
      },
      { parameters: [input.id, input.version], sql: 'DELETE FROM todo_calendar_events WHERE subscription_id = ? AND version = ?' },
      { parameters: [input.id, input.version, input.fetchedAt, input.rawIcs], sql: `
        INSERT INTO todo_calendar_versions (subscription_id, version, fetched_at, raw_ics)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(subscription_id, version) DO UPDATE SET fetched_at = excluded.fetched_at, raw_ics = excluded.raw_ics
      ` },
      ...input.events.map(event => ({
        parameters: [input.id, input.version, event.uid, event.startDate, event.endDate, event.startAt ?? null, event.endAt ?? null, event.allDay === false ? 0 : 1, event.title],
        sql: 'INSERT INTO todo_calendar_events (subscription_id, version, uid, start_date, end_date, start_at, end_at, all_day, title) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      })),
    ]))
  }
}
