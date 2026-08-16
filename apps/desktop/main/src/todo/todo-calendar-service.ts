import type {
  EditorStorage,
  JournalDate,
  TodoCalendarEvent,
  TodoCalendarSubscription,
} from '@memorilo/editor-storage'
import { createHash, randomUUID } from 'node:crypto'

export const defaultChinaHolidayCalendar = {
  id: 'cn-holidays',
  title: '中国节假日',
  url: 'webcal://p10-calendars.icloud.com/holiday/CN_zh.ics',
} as const

interface IcsProperty {
  name: string
  parameters: Readonly<Record<string, string>>
  value: string
}

interface ParsedIcsEvent {
  endDate: JournalDate | null
  startDate: JournalDate
  title: string
  uid: string
  recurrence?: { count?: number, frequency: 'DAILY' | 'MONTHLY' | 'WEEKLY' | 'YEARLY', interval: number, until?: JournalDate }
  exclusions: readonly JournalDate[]
}

export interface TodoCalendarService {
  listEvents: (input: { from: JournalDate, through: JournalDate }) => Promise<readonly TodoCalendarEvent[]>
  listSubscriptions: () => Promise<readonly TodoCalendarSubscription[]>
  refresh: (id: string) => Promise<TodoCalendarSubscription>
  remove: (id: string) => Promise<void>
  subscribe: (input: { title: string, url: string }) => Promise<TodoCalendarSubscription>
}

function isChinaLocale(language: string): boolean {
  const resolved = Intl.DateTimeFormat().resolvedOptions().locale
  return language === 'zh-CN' || /(?:^|[-_])CN(?:[-_]|$)/u.test(resolved)
}

function normalizeUrl(value: string): string {
  const url = value.trim()
  if (url.startsWith('webcal://'))
    return `https://${url.slice('webcal://'.length)}`
  if (url.startsWith('https://') || url.startsWith('http://'))
    return url
  throw new TypeError('ICS subscription URL must use webcal, http, or https')
}

function unfold(text: string): readonly string[] {
  const lines = text.replace(/\r\n?/gu, '\n').split('\n')
  const result: string[] = []
  for (const line of lines) {
    if ((line.startsWith(' ') || line.startsWith('\t')) && result.length > 0)
      result[result.length - 1] += line.slice(1)
    else
      result.push(line)
  }
  return result
}

function property(line: string): IcsProperty | null {
  const separator = line.indexOf(':')
  if (separator < 1)
    return null
  const header = line.slice(0, separator).split(';')
  const name = header.shift()?.toUpperCase()
  if (!name)
    return null
  const parameters: Record<string, string> = {}
  for (const item of header) {
    const equals = item.indexOf('=')
    if (equals > 0)
      parameters[item.slice(0, equals).toUpperCase()] = item.slice(equals + 1)
  }
  return { name, parameters, value: line.slice(separator + 1) }
}

function decodeText(value: string): string {
  return value.replace(/\\([\\,;N])/giu, (_, escaped: string) => escaped.toLowerCase() === 'n' ? '\n' : escaped)
}

function dateFromValue(value: string): JournalDate | null {
  const match = /^(\d{4})(\d{2})(\d{2})/u.exec(value)
  if (!match)
    return null
  return `${match[1]}-${match[2]}-${match[3]}`
}

function dateToUtc(value: JournalDate): Date {
  const [year, month, day] = value.split('-').map(Number)
  if (year === undefined || month === undefined || day === undefined
    || !Number.isSafeInteger(year) || !Number.isSafeInteger(month) || !Number.isSafeInteger(day)) {
    throw new TypeError(`Invalid calendar date: ${value}`)
  }
  return new Date(Date.UTC(year, month - 1, day))
}

function utcToDate(value: Date): JournalDate {
  return [value.getUTCFullYear(), value.getUTCMonth() + 1, value.getUTCDate()]
    .map((part, index) => index === 0 ? String(part).padStart(4, '0') : String(part).padStart(2, '0'))
    .join('-')
}

function addDate(value: JournalDate, frequency: NonNullable<ParsedIcsEvent['recurrence']>['frequency'], interval: number): JournalDate {
  const date = dateToUtc(value)
  if (frequency === 'DAILY')
    date.setUTCDate(date.getUTCDate() + interval)
  else if (frequency === 'WEEKLY')
    date.setUTCDate(date.getUTCDate() + interval * 7)
  else if (frequency === 'MONTHLY')
    date.setUTCMonth(date.getUTCMonth() + interval)
  else
    date.setUTCFullYear(date.getUTCFullYear() + interval)
  return utcToDate(date)
}

function parseRecurrence(value: string): ParsedIcsEvent['recurrence'] | undefined {
  const values = new Map(value.split(';').map((item) => {
    const [key, raw] = item.split('=', 2)
    return [key?.toUpperCase() ?? '', raw ?? ''] as const
  }))
  const frequency = values.get('FREQ')
  if (frequency !== 'DAILY' && frequency !== 'WEEKLY' && frequency !== 'MONTHLY' && frequency !== 'YEARLY')
    return undefined
  const interval = Number(values.get('INTERVAL') ?? '1')
  if (!Number.isSafeInteger(interval) || interval < 1)
    return undefined
  const countValue = values.get('COUNT')
  const count = countValue === undefined ? undefined : Number(countValue)
  const until = values.get('UNTIL') === undefined ? undefined : dateFromValue(values.get('UNTIL') ?? '') ?? undefined
  if (count !== undefined && (!Number.isSafeInteger(count) || count < 1))
    return undefined
  return { ...(count === undefined ? {} : { count }), frequency, interval, ...(until === undefined ? {} : { until }) }
}

function parseEvents(text: string, range: { from: JournalDate, through: JournalDate }): readonly Omit<TodoCalendarEvent, 'subscriptionId' | 'subscriptionTitle'>[] {
  const events: Omit<TodoCalendarEvent, 'subscriptionId' | 'subscriptionTitle'>[] = []
  let current: Partial<ParsedIcsEvent> | null = null
  const flush = () => {
    if (!current?.uid || !current.startDate || !current.title)
      return
    const recurrence = current.recurrence
    const exclusions = new Set(current.exclusions ?? [])
    let date = current.startDate
    let occurrence = 0
    const max = Math.min(recurrence?.count ?? 256, 2048)
    while (occurrence < max && date <= range.through) {
      if (date >= range.from && !exclusions.has(date)) {
        events.push({
          endDate: current.endDate ?? null,
          startDate: date,
          title: current.title,
          uid: `${current.uid}:${date}`,
        })
      }
      occurrence += 1
      if (!recurrence)
        break
      if (recurrence.until !== undefined && date >= recurrence.until)
        break
      date = addDate(date, recurrence.frequency, recurrence.interval)
    }
    current = null
  }
  for (const line of unfold(text)) {
    if (line.toUpperCase() === 'BEGIN:VEVENT') {
      flush()
      current = { exclusions: [] }
      continue
    }
    if (line.toUpperCase() === 'END:VEVENT') {
      flush()
      continue
    }
    if (!current)
      continue
    const parsed = property(line)
    if (!parsed)
      continue
    if (parsed.name === 'UID') {
      current.uid = decodeText(parsed.value)
    }
    else if (parsed.name === 'SUMMARY') {
      current.title = decodeText(parsed.value)
    }
    else if (parsed.name === 'DTSTART') {
      current.startDate = dateFromValue(parsed.value) ?? undefined
    }
    else if (parsed.name === 'DTEND') {
      const end = dateFromValue(parsed.value)
      if (end !== null) {
        const exclusive = parsed.parameters.VALUE === 'DATE'
        current.endDate = exclusive ? utcToDate(new Date(dateToUtc(end).getTime() - 86_400_000)) : end
      }
    }
    else if (parsed.name === 'RRULE') {
      current.recurrence = parseRecurrence(parsed.value)
    }
    else if (parsed.name === 'EXDATE') {
      const dates = parsed.value.split(',').map(dateFromValue).filter((date): date is JournalDate => date !== null)
      if (dates.length > 0)
        current.exclusions = [...(current.exclusions ?? []), ...dates]
    }
  }
  flush()
  return events
}

function hash(text: string): string {
  return createHash('sha256').update(text).digest('hex')
}

export function createTodoCalendarService(
  storage: EditorStorage,
  language: () => string,
): TodoCalendarService {
  const ensureDefault = async (): Promise<void> => {
    if (isChinaLocale(language()))
      await storage.todoCalendars.ensureSubscription(defaultChinaHolidayCalendar)
  }
  return {
    async listEvents(input) {
      await ensureDefault()
      const subscriptions = await storage.todoCalendars.listSubscriptions()
      const pendingDefault = subscriptions.find(subscription => subscription.id === defaultChinaHolidayCalendar.id && subscription.fetchedAt === null)
      if (pendingDefault)
        await this.refresh(pendingDefault.id)
      return storage.todoCalendars.listEvents(input)
    },
    async listSubscriptions() {
      await ensureDefault()
      const subscriptions = await storage.todoCalendars.listSubscriptions()
      const pendingDefault = subscriptions.find(subscription => subscription.id === defaultChinaHolidayCalendar.id && subscription.fetchedAt === null)
      if (pendingDefault)
        await this.refresh(pendingDefault.id)
      return storage.todoCalendars.listSubscriptions()
    },
    async refresh(id) {
      const subscriptions = await storage.todoCalendars.listSubscriptions()
      const subscription = subscriptions.find(item => item.id === id)
      if (!subscription)
        throw new Error(`Unknown ICS subscription ${id}`)
      const response = await fetch(normalizeUrl(subscription.url), {
        headers: {
          ...(subscription.etag === null ? {} : { 'If-None-Match': subscription.etag }),
          ...(subscription.lastModified === null ? {} : { 'If-Modified-Since': subscription.lastModified }),
        },
      })
      if (response.status === 304)
        return subscription
      if (!response.ok)
        throw new Error(`ICS subscription ${id} returned HTTP ${response.status}`)
      const rawIcs = await response.text()
      if (rawIcs.length > 5_000_000)
        throw new RangeError(`ICS subscription ${id} exceeds the 5 MB limit`)
      const now = Date.now()
      const from = utcToDate(new Date(Date.UTC(new Date().getUTCFullYear() - 1, 0, 1)))
      const through = utcToDate(new Date(Date.UTC(new Date().getUTCFullYear() + 5, 11, 31)))
      await storage.todoCalendars.saveSnapshot({
        etag: response.headers.get('etag'),
        events: parseEvents(rawIcs, { from, through }),
        fetchedAt: now,
        id: subscription.id,
        lastModified: response.headers.get('last-modified'),
        rawIcs,
        title: subscription.title,
        url: subscription.url,
        version: hash(rawIcs),
      })
      const refreshed = await storage.todoCalendars.listSubscriptions()
      const result = refreshed.find(item => item.id === id)
      if (!result)
        throw new Error(`ICS subscription ${id} disappeared after refresh`)
      return result
    },
    remove: id => storage.todoCalendars.remove(id),
    async subscribe(input) {
      const title = input.title.trim()
      if (title.length === 0)
        throw new TypeError('ICS subscription title must not be empty')
      const url = normalizeUrl(input.url)
      const id = randomUUID()
      await storage.todoCalendars.ensureSubscription({ id, title, url })
      return this.refresh(id)
    },
  }
}
