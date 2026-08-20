import type { TaskRepeatRule } from '../schema/task-schema'
import dayjs from 'dayjs'
import { parseTaskDateTime, parseTaskDueDate, parseTaskRepeatRule, transitionTaskAttrs } from '../schema/task-schema'

export type RecurringTaskCompletionAction
  = | 'archive-completed-to-today'
    | 'move-next-to-today'
    | 'move-next-to-due-date'
    | 'nest-completed-under-next'
    | 'place-next-after-completed'
    | 'replace-completed'

export interface RecurringTaskOccurrencePlan {
  completedAttrs: Readonly<Record<string, unknown>>
  nextAttrs: Readonly<Record<string, unknown>>
  repeatRule: TaskRepeatRule
}

function nextOccurrenceDateTime(
  value: unknown,
  sourceDate: string | null,
  nextDate: string | null,
): string | null {
  if (value === null || value === undefined || nextDate === null)
    return null
  const parsed = parseTaskDateTime(value)
  if (parsed === null)
    throw new TypeError('Recurring task has an invalid scheduled date and time')
  const anchor = sourceDate ?? parsed.slice(0, 10)
  const dayOffset = dayjs(parsed.slice(0, 10)).diff(dayjs(anchor), 'day')
  return `${dayjs(nextDate).add(dayOffset, 'day').format('YYYY-MM-DD')}${parsed.slice(10)}`
}

export function resetTaskForNextOccurrence(
  attrs: Readonly<Record<string, unknown>>,
  dueDate: string | null,
): Readonly<Record<string, unknown>> {
  const sourceDateValue = attrs.dueDate
  const sourceDate = sourceDateValue === null || sourceDateValue === undefined
    ? null
    : parseTaskDueDate(sourceDateValue)
  if (sourceDateValue !== null && sourceDateValue !== undefined && sourceDate === null)
    throw new TypeError('Recurring task has an invalid due date')
  return {
    ...attrs,
    checked: false,
    dueDate,
    endAt: nextOccurrenceDateTime(attrs.endAt, sourceDate, dueDate),
    elapsedMs: 0,
    startAt: nextOccurrenceDateTime(attrs.startAt, sourceDate, dueDate),
    startedAt: null,
    status: 'todo',
  }
}

export function planRecurringTaskOccurrences(
  sourceAttrs: Readonly<Record<string, unknown>>,
  nextDueDate: string,
): RecurringTaskOccurrencePlan {
  const repeatRule = parseTaskRepeatRule(sourceAttrs.repeatRule)
  if (repeatRule === null)
    throw new TypeError('Completing a recurring task requires a valid repeat rule')

  return {
    completedAttrs: {
      ...sourceAttrs,
      ...transitionTaskAttrs(sourceAttrs, 'done'),
      repeatRule: null,
    },
    nextAttrs: resetTaskForNextOccurrence(sourceAttrs, nextDueDate),
    repeatRule,
  }
}
