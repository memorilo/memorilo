import type { TaskRepeatRule } from '../schema/task-schema'
import { parseTaskRepeatRule, transitionTaskAttrs } from '../schema/task-schema'

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

export function resetTaskForNextOccurrence(
  attrs: Readonly<Record<string, unknown>>,
  dueDate: string | null,
): Readonly<Record<string, unknown>> {
  return {
    ...attrs,
    checked: false,
    dueDate,
    elapsedMs: 0,
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
