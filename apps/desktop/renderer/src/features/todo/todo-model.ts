import type { DesktopTodoCalendarEvent, DesktopTodoCalendarSubscription, DesktopTodoRepeatRule, DesktopTodoTask, DesktopTodoTaskPage, DesktopTodoTaskStatus } from '@memorilo/desktop-api'
import type { Dayjs } from 'dayjs'
import type { InfiniteData } from 'effect-query'
import type { DesktopClientError } from '../../shared/effect-query'
import dayjs from 'dayjs'
import { desktopRequests } from '../../shared/desktop-requests'
import { desktopEffect, desktopEffectQuery } from '../../shared/effect-query'
import { todoQueryKeys } from './query-keys'

export type TodoFilter = 'all' | DesktopTodoTaskStatus
export type TodoView = 'list' | 'board' | 'timeline' | 'calendar' | 'quadrant'

export type TodoQuadrant = 'importantUrgent' | 'importantNotUrgent' | 'notImportantUrgent' | 'notImportantNotUrgent'

export const todoStatuses: readonly DesktopTodoTaskStatus[] = ['todo', 'doing', 'done']

export const todoTaskPageSize = 100

export function todoTaskKey(task: Pick<DesktopTodoTask, 'blockId' | 'noteId' | 'topicId'>): string {
  return `${task.noteId}\0${task.topicId}\0${task.blockId}`
}

export function todoTaskQueryOptions(filter: TodoFilter) {
  return desktopEffectQuery.infiniteQueryOptions<
    DesktopTodoTaskPage,
    DesktopClientError,
    never,
    InfiniteData<DesktopTodoTaskPage>,
    number | null
  >({
    getNextPageParam: lastPage => lastPage.nextCursor ?? undefined,
    initialPageParam: null,
    queryFn: ({ pageParam }) => desktopEffect('notes.list-todo-tasks', () => (
      desktopRequests.listTodoTasks({
        ...(pageParam === null ? {} : { cursor: pageParam }),
        limit: todoTaskPageSize,
        ...(filter === 'all' ? {} : { status: filter }),
      })
    )),
    queryKey: todoQueryKeys.list(filter),
  })
}

export function todoCalendarQueryOptions() {
  return desktopEffectQuery.queryOptions<{
    events: readonly DesktopTodoCalendarEvent[]
    subscriptions: readonly DesktopTodoCalendarSubscription[]
  }, DesktopClientError, never>({
    queryFn: () => desktopEffect('notes.listTodoCalendarEvents', async () => {
      const subscriptions = await desktopRequests.listTodoCalendarSubscriptions()
      const year = dayjs().year()
      const events = await desktopRequests.listTodoCalendarEvents({
        from: `${year - 1}-01-01`,
        through: `${year + 5}-12-31`,
      })
      return { events, subscriptions }
    }),
    queryKey: todoQueryKeys.calendars,
  })
}

export function taskElapsedMs(
  task: { elapsedMs: number, startedAt: number | null, status: DesktopTodoTaskStatus },
  now: number,
): number {
  if (!Number.isFinite(now))
    throw new TypeError('Todo clock must be a finite number')
  if (task.status === 'doing' && task.startedAt !== null)
    return task.elapsedMs + Math.max(0, now - task.startedAt)
  return task.elapsedMs
}

export function formatTaskDuration(milliseconds: number): string {
  if (!Number.isFinite(milliseconds) || milliseconds < 0)
    throw new TypeError('Todo duration must be a non-negative finite number')
  const totalMinutes = Math.floor(milliseconds / 60_000)
  if (totalMinutes < 1)
    return '<1m'
  if (totalMinutes < 60)
    return `${totalMinutes}m`
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return minutes === 0 ? `${hours}h` : `${hours}h ${minutes}m`
}

export function groupTodoTasks(tasks: readonly DesktopTodoTask[]): Readonly<Record<DesktopTodoTaskStatus, readonly DesktopTodoTask[]>> {
  const grouped: Record<DesktopTodoTaskStatus, DesktopTodoTask[]> = {
    doing: [],
    done: [],
    todo: [],
  }
  for (const task of tasks)
    grouped[task.status].push(task)
  return grouped
}

export function taskPlanningDate(task: Pick<DesktopTodoTask, 'dueDate' | 'journalDate' | 'startedAt'>): string | null {
  if (task.dueDate !== null)
    return task.dueDate
  if (task.journalDate !== null)
    return task.journalDate
  if (task.startedAt === null)
    return null
  return dayjs(task.startedAt).format('YYYY-MM-DD')
}

export function taskOccurrenceDate(task: Pick<DesktopTodoTask, 'dueDate' | 'journalDate' | 'startedAt'>, today = dayjs().format('YYYY-MM-DD')): string {
  return task.dueDate ?? taskPlanningDate(task) ?? today
}

function dateValue(date: string): Dayjs {
  const parsed = dayjs(date)
  if (!parsed.isValid() || parsed.format('YYYY-MM-DD') !== date)
    throw new TypeError(`Invalid Todo date: ${date}`)
  return parsed.startOf('day')
}

export function taskRepeatBaseDate(
  task: Pick<DesktopTodoTask, 'dueDate' | 'journalDate' | 'startedAt'>,
  rule: DesktopTodoRepeatRule,
  completedOn: string,
): string {
  dateValue(completedOn)
  return rule.mode === 'completion' ? completedOn : taskOccurrenceDate(task, completedOn)
}

function calendarDates(
  rule: DesktopTodoRepeatRule,
  calendarEvents: readonly DesktopTodoCalendarEvent[],
): readonly string[] {
  const needsCalendar = rule.unit === 'holiday' || (rule.holidayPolicy !== undefined && rule.holidayPolicy !== 'allow')
  if (!needsCalendar)
    return []
  if (rule.calendarId === undefined)
    throw new TypeError('Todo repeat rule requires a calendar subscription')
  return [...new Set(calendarEvents
    .filter(event => event.subscriptionId === rule.calendarId)
    .map(event => event.startDate))]
    .sort()
}

function nextWeeklyOccurrence(current: Dayjs, interval: number, weekdays: readonly number[]): Dayjs {
  const selected = [...new Set(weekdays)].sort((left, right) => left - right)
  if (selected.length === 0)
    return current.add(interval, 'week')
  const laterThisWeek = selected.find(weekday => weekday > current.day())
  if (laterThisWeek !== undefined)
    return current.add(laterThisWeek - current.day(), 'day')
  const first = selected[0]
  if (first === undefined)
    throw new Error('Weekly Todo recurrence does not have a selected weekday')
  return current.subtract(current.day(), 'day').add(interval, 'week').add(first, 'day')
}

function nextRegularOccurrence(current: Dayjs, rule: DesktopTodoRepeatRule): Dayjs {
  if (rule.unit === 'day')
    return current.add(rule.interval, 'day')
  if (rule.unit === 'week')
    return rule.weekdays ? nextWeeklyOccurrence(current, rule.interval, rule.weekdays) : current.add(rule.interval, 'week')
  if (rule.unit === 'month')
    return current.add(rule.interval, 'month')
  if (rule.unit === 'year')
    return current.add(rule.interval, 'year')
  throw new TypeError('Holiday Todo recurrence requires calendar events')
}

function nextWorkday(date: Dayjs, holidays: ReadonlySet<string>): Dayjs {
  let next = date
  while (holidays.has(next.format('YYYY-MM-DD')) || next.day() === 0 || next.day() === 6)
    next = next.add(1, 'day')
  return next
}

export function nextTodoOccurrenceDate(
  currentDate: string,
  rule: DesktopTodoRepeatRule,
  calendarEvents: readonly DesktopTodoCalendarEvent[] = [],
): string {
  const current = dateValue(currentDate)
  const holidayDates = calendarDates(rule, calendarEvents)
  const holidays = new Set(holidayDates)
  if (rule.unit === 'holiday') {
    const next = holidayDates
      .filter(date => date > currentDate)
      .at(rule.interval - 1 + (rule.holidayPolicy === 'skip' ? 1 : 0))
    if (!next)
      throw new RangeError(`No future holiday occurrence is available for ${rule.calendarId}`)
    const occurrence = dateValue(next)
    return (rule.holidayPolicy === 'next-workday' ? nextWorkday(occurrence, holidays) : occurrence).format('YYYY-MM-DD')
  }
  let next = nextRegularOccurrence(current, rule)
  if (rule.holidayPolicy === 'next-workday') {
    next = nextWorkday(next, holidays)
  }
  else if (rule.holidayPolicy === 'skip') {
    for (let attempts = 0; holidays.has(next.format('YYYY-MM-DD')); attempts++) {
      if (attempts >= 2048)
        throw new RangeError('Todo recurrence could not find a non-holiday occurrence')
      next = nextRegularOccurrence(next, rule)
    }
  }
  return next.format('YYYY-MM-DD')
}

export function groupTodoTasksByDate(tasks: readonly DesktopTodoTask[]): ReadonlyMap<string, readonly DesktopTodoTask[]> {
  const grouped = new Map<string, DesktopTodoTask[]>()
  for (const task of tasks) {
    const date = taskPlanningDate(task)
    if (date === null)
      continue
    const dateTasks = grouped.get(date)
    if (dateTasks)
      dateTasks.push(task)
    else
      grouped.set(date, [task])
  }
  return grouped
}

export function classifyTodoQuadrant(task: DesktopTodoTask, today: string): TodoQuadrant {
  const date = taskPlanningDate(task)
  const urgent = task.status !== 'done' && date !== null && date <= today
  if (task.noteFavorite)
    return urgent ? 'importantUrgent' : 'importantNotUrgent'
  return urgent ? 'notImportantUrgent' : 'notImportantNotUrgent'
}
