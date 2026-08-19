import type { DesktopTodoCalendarEvent, DesktopTodoCalendarSubscription, DesktopTodoRepeatRule, DesktopTodoTask, DesktopTodoTaskPage, DesktopTodoTaskStatus } from '@memorilo/desktop-api'
import type { InfiniteData } from 'effect-query'
import type { DesktopClientError } from '../../shared/effect-query'
import { nextTaskOccurrenceDate, taskRepeatBaseDate as repeatBaseDate } from '@memorilo/editor/task'
import dayjs from 'dayjs'
import { desktopRequests } from '../../shared/desktop-requests'
import { desktopEffect, desktopEffectQuery } from '../../shared/effect-query'
import { loadTodoCalendarSnapshot, todoCalendarAutoRefreshIntervalMs } from '../../shared/todo-calendar-cache'
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
    queryFn: () => desktopEffect('notes.listTodoCalendarEvents', loadTodoCalendarSnapshot),
    queryKey: todoQueryKeys.calendars,
    refetchInterval: todoCalendarAutoRefreshIntervalMs,
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

function taskDateValue(date: string): Date {
  const value = dayjs(date)
  if (!value.isValid() || value.format('YYYY-MM-DD') !== date)
    throw new TypeError(`Todo date must be a valid ISO date: ${date}`)
  return value.startOf('day').toDate()
}

export type TodoTaskDueState = 'overdue' | 'upcoming'

export function taskDueState(dueDate: string, now: number): TodoTaskDueState {
  if (!Number.isFinite(now))
    throw new TypeError('Todo clock must be a finite number')
  const due = taskDateValue(dueDate)
  const today = new Date(now)
  today.setHours(0, 0, 0, 0)
  return due.getTime() < today.getTime() ? 'overdue' : 'upcoming'
}

export function formatTaskDueDate(dueDate: string, locale: string, now: number): string {
  const due = taskDateValue(dueDate)
  const today = new Date(now)
  const options: Intl.DateTimeFormatOptions = {
    day: 'numeric',
    month: 'short',
    ...(due.getFullYear() === today.getFullYear() ? {} : { year: 'numeric' }),
  }
  return new Intl.DateTimeFormat(locale, options).format(due)
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

export function taskRepeatBaseDate(
  task: Pick<DesktopTodoTask, 'dueDate' | 'journalDate' | 'startedAt'>,
  rule: DesktopTodoRepeatRule,
  completedOn: string,
): string {
  return repeatBaseDate(taskOccurrenceDate(task, completedOn), rule, completedOn)
}

export function nextTodoOccurrenceDate(
  currentDate: string,
  rule: DesktopTodoRepeatRule,
  calendarEvents: readonly DesktopTodoCalendarEvent[] = [],
): string {
  return nextTaskOccurrenceDate(currentDate, rule, calendarEvents)
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
