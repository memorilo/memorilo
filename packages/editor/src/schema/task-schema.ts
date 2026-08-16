import type { Extension } from 'prosekit/core'
import { defineNodeAttr, union } from 'prosekit/core'

export type TaskStatus = 'todo' | 'doing' | 'done'

export type TaskRepeatMode = 'due' | 'completion'
export type TaskRepeatUnit = 'day' | 'week' | 'month' | 'year' | 'holiday'
export type TaskRepeatHolidayPolicy = 'allow' | 'skip' | 'next-workday'

export interface TaskRepeatRule {
  holidayPolicy?: TaskRepeatHolidayPolicy
  interval: number
  mode: TaskRepeatMode
  unit: TaskRepeatUnit
  weekdays?: readonly number[]
  /** The subscribed ICS calendar used by holiday repeats. */
  calendarId?: string
}

const journalDatePattern = /^\d{4}-\d{2}-\d{2}$/u

export function parseTaskRepeatRule(value: unknown): TaskRepeatRule | null {
  if (typeof value !== 'object' || value === null)
    return null
  const candidate = value as Record<string, unknown>
  const { calendarId, holidayPolicy, interval, mode, unit, weekdays } = candidate
  if (mode !== 'due' && mode !== 'completion')
    return null
  if (unit !== 'day' && unit !== 'week' && unit !== 'month' && unit !== 'year' && unit !== 'holiday')
    return null
  if (typeof interval !== 'number' || !Number.isSafeInteger(interval) || interval < 1 || interval > 999)
    return null
  if (calendarId !== undefined && (typeof calendarId !== 'string' || calendarId.length === 0))
    return null
  if (holidayPolicy !== undefined && holidayPolicy !== 'allow' && holidayPolicy !== 'skip' && holidayPolicy !== 'next-workday')
    return null
  if (weekdays !== undefined && (!Array.isArray(weekdays) || weekdays.some(day => typeof day !== 'number' || !Number.isInteger(day) || day < 0 || day > 6)))
    return null
  if (unit === 'holiday' && (typeof calendarId !== 'string' || calendarId.length === 0))
    return null
  return {
    ...(calendarId === undefined ? {} : { calendarId }),
    ...(holidayPolicy === undefined ? {} : { holidayPolicy }),
    interval,
    mode,
    unit,
    ...(weekdays === undefined ? {} : { weekdays: [...weekdays] }),
  }
}

export function parseTaskDueDate(value: unknown): string | null {
  return typeof value === 'string' && journalDatePattern.test(value) ? value : null
}

export interface TaskHistory {
  status: TaskStatus
  elapsedMs: number
}

export function parseTaskHistory(value: unknown): TaskHistory | null {
  if (typeof value !== 'object' || value === null)
    return null

  const { status, elapsedMs } = value as Record<string, unknown>
  if (status !== 'todo' && status !== 'doing' && status !== 'done')
    return null
  if (typeof elapsedMs !== 'number' || !Number.isFinite(elapsedMs) || elapsedMs < 0)
    return null

  return { status, elapsedMs }
}

export function defineTaskAttrs(): Extension {
  return union(
    defineNodeAttr<'list', 'status', TaskStatus | null>({
      type: 'list',
      attr: 'status',
      default: null,
      splittable: false,
      toDOM: value => (value ? ['data-task-status', value] : null),
      parseDOM: (element) => {
        const value = element.getAttribute('data-task-status')
        return value === 'todo' || value === 'doing' || value === 'done' ? value : null
      },
    }),
    defineNodeAttr({
      type: 'list',
      attr: 'elapsedMs',
      default: 0,
      splittable: false,
      toDOM: value => (value ? ['data-task-elapsed', String(value)] : null),
      parseDOM: (element) => {
        const raw = element.getAttribute('data-task-elapsed')
        const parsed = raw == null ? 0 : Number.parseInt(raw, 10)
        return Number.isFinite(parsed) ? parsed : 0
      },
    }),
    defineNodeAttr<'list', 'startedAt', number | null>({
      type: 'list',
      attr: 'startedAt',
      default: null,
      splittable: false,
      toDOM: value => (value != null ? ['data-task-started-at', String(value)] : null),
      parseDOM: (element) => {
        const raw = element.getAttribute('data-task-started-at')
        if (raw == null)
          return null
        const parsed = Number.parseInt(raw, 10)
        return Number.isFinite(parsed) ? parsed : null
      },
    }),
    defineNodeAttr<'list', 'dueDate', string | null>({
      type: 'list',
      attr: 'dueDate',
      default: null,
      splittable: false,
      toDOM: value => (value ? ['data-task-due-date', value] : null),
      parseDOM: element => parseTaskDueDate(element.getAttribute('data-task-due-date')),
    }),
    defineNodeAttr<'list', 'repeatRule', TaskRepeatRule | null>({
      type: 'list',
      attr: 'repeatRule',
      default: null,
      splittable: false,
      toDOM: value => (value ? ['data-task-repeat', JSON.stringify(value)] : null),
      parseDOM: (element) => {
        const raw = element.getAttribute('data-task-repeat')
        if (raw === null)
          return null
        try {
          return parseTaskRepeatRule(JSON.parse(raw))
        }
        catch {
          return null
        }
      },
    }),
    defineNodeAttr<'paragraph', 'taskHistory', TaskHistory | null>({
      type: 'paragraph',
      attr: 'taskHistory',
      default: null,
      splittable: false,
      toDOM: value => (value ? ['data-task-history', JSON.stringify(value)] : null),
      parseDOM: (element) => {
        const raw = element.getAttribute('data-task-history')
        if (raw == null)
          return null
        try {
          return parseTaskHistory(JSON.parse(raw))
        }
        catch {
          return null
        }
      },
    }),
  )
}
