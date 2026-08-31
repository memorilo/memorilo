import type { EditorStorageDatabase, EditorStorageDrizzleDatabase, StorageOperationRunner } from './database-driver'
import type {
  EditorTodoCalendarStorage,
  SaveTodoCalendarSnapshotInput,
  TodoCalendarEvent,
  TodoCalendarSubscription,
} from './editor-storage-contracts'
import { and, asc, eq, gte, isNull, lte, or, sql } from 'drizzle-orm'
import { todoCalendarEvents, todoCalendarSubscriptions, todoCalendarVersions } from './drizzle-schema'

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
  readonly #orm: EditorStorageDrizzleDatabase

  constructor(options: EditorTodoCalendarRepositoryOptions) {
    this.#options = options
    this.#orm = options.database.drizzle
  }

  readonly listSubscriptions = (): Promise<readonly TodoCalendarSubscription[]> => this.#options.runOperation(async () => {
    const rows = this.#orm.select({
      id: todoCalendarSubscriptions.id,
      url: todoCalendarSubscriptions.url,
      title: todoCalendarSubscriptions.title,
      enabled: todoCalendarSubscriptions.enabled,
      version: todoCalendarSubscriptions.version,
      fetched_at: todoCalendarSubscriptions.fetchedAt,
      etag: todoCalendarSubscriptions.etag,
      last_modified: todoCalendarSubscriptions.lastModified,
    }).from(todoCalendarSubscriptions).orderBy(asc(sql`lower(${todoCalendarSubscriptions.title})`), asc(todoCalendarSubscriptions.id)).all() as SubscriptionRow[]
    return rows.map(toSubscription)
  })

  readonly ensureSubscription = (input: { id: string, title: string, url: string }): Promise<void> => {
    if (input.id.length === 0 || input.title.length === 0 || input.url.length === 0)
      throw new TypeError('Calendar subscription identity must not be empty')
    return this.#options.runOperation(async () => {
      this.#orm.insert(todoCalendarSubscriptions)
        .values({ id: input.id, url: input.url, title: input.title, enabled: 1 })
        .onConflictDoNothing()
        .run()
    })
  }

  readonly listEvents = (input: { from: string, through: string }): Promise<readonly TodoCalendarEvent[]> => {
    assertDate(input.from, 'Calendar event range start')
    assertDate(input.through, 'Calendar event range end')
    if (input.from > input.through)
      throw new RangeError('Calendar event range start must not be after the end')
    return this.#options.runOperation(async () => {
      const rows = this.#orm.select({
        uid: todoCalendarEvents.uid,
        start_date: todoCalendarEvents.startDate,
        end_date: todoCalendarEvents.endDate,
        start_at: todoCalendarEvents.startAt,
        end_at: todoCalendarEvents.endAt,
        all_day: todoCalendarEvents.allDay,
        title: todoCalendarEvents.title,
        subscription_id: todoCalendarEvents.subscriptionId,
        subscription_title: todoCalendarSubscriptions.title,
      }).from(todoCalendarEvents).innerJoin(todoCalendarSubscriptions, and(
        eq(todoCalendarSubscriptions.id, todoCalendarEvents.subscriptionId),
        eq(todoCalendarSubscriptions.version, todoCalendarEvents.version),
      )).where(and(
        eq(todoCalendarSubscriptions.enabled, 1),
        lte(todoCalendarEvents.startDate, input.through),
        or(isNull(todoCalendarEvents.endDate), gte(todoCalendarEvents.endDate, input.from)),
      )).orderBy(asc(todoCalendarEvents.startDate), asc(todoCalendarEvents.uid)).all() as EventRow[]
      return rows.map(toEvent)
    })
  }

  readonly markFetched = (id: string, fetchedAt: number): Promise<void> => {
    if (id.length === 0)
      throw new TypeError('Calendar subscription id must not be empty')
    if (!Number.isSafeInteger(fetchedAt) || fetchedAt < 0)
      throw new RangeError('Calendar subscription fetchedAt must be a non-negative safe integer')
    return this.#options.runOperation(async () => {
      this.#orm.update(todoCalendarSubscriptions).set({ fetchedAt }).where(eq(todoCalendarSubscriptions.id, id)).run()
    })
  }

  readonly remove = (id: string): Promise<void> => {
    if (id.length === 0)
      throw new TypeError('Calendar subscription id must not be empty')
    return this.#options.runOperation(async () => {
      this.#orm.delete(todoCalendarSubscriptions).where(eq(todoCalendarSubscriptions.id, id)).run()
    })
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
    return this.#options.runOperation(async () => {
      this.#orm.transaction((tx) => {
        tx.insert(todoCalendarSubscriptions).values({
          id: input.id,
          url: input.url,
          title: input.title,
          enabled: 1,
          version: input.version,
          fetchedAt: input.fetchedAt,
          etag: input.etag ?? null,
          lastModified: input.lastModified ?? null,
        }).onConflictDoUpdate({
          target: todoCalendarSubscriptions.id,
          set: { url: input.url, title: input.title, version: input.version, fetchedAt: input.fetchedAt, etag: input.etag ?? null, lastModified: input.lastModified ?? null },
        }).run()
        tx.delete(todoCalendarEvents).where(and(eq(todoCalendarEvents.subscriptionId, input.id), eq(todoCalendarEvents.version, input.version))).run()
        tx.insert(todoCalendarVersions).values({ subscriptionId: input.id, version: input.version, fetchedAt: input.fetchedAt, rawIcs: input.rawIcs }).onConflictDoUpdate({ target: [todoCalendarVersions.subscriptionId, todoCalendarVersions.version], set: { fetchedAt: input.fetchedAt, rawIcs: input.rawIcs } }).run()
        if (input.events.length > 0)
          tx.insert(todoCalendarEvents).values(input.events.map(event => ({ subscriptionId: input.id, version: input.version, uid: event.uid, startDate: event.startDate, endDate: event.endDate, startAt: event.startAt ?? null, endAt: event.endAt ?? null, allDay: event.allDay === false ? 0 : 1, title: event.title }))).run()
      })
    })
  }
}
