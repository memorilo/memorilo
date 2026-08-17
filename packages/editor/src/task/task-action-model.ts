import type { TaskRepeatRule, TaskStatus } from '../schema/task-schema'
import { parseTaskDueDate, parseTaskRepeatRule, transitionTaskAttrs } from '../schema/task-schema'
import { resetTaskForNextOccurrence } from './task-completion'

export interface TaskActionUpdate {
  dueDate?: string | null
  nextDueDate?: string | null
  onlyThis?: boolean
  repeatRule?: TaskRepeatRule | null
  status?: TaskStatus
  text?: string
}

export interface TaskActionMutation {
  attrs: Readonly<Record<string, unknown>>
  text?: string
}

export interface TaskActionPlan {
  current: TaskActionMutation
  occurrence?: TaskActionMutation & { text: string }
}

function taskDate(value: string | null, name: string): string | null {
  if (value === null)
    return null
  const parsed = parseTaskDueDate(value)
  if (parsed === null)
    throw new TypeError(`${name} must use YYYY-MM-DD format`)
  return parsed
}

export function planTaskAction(
  sourceAttrs: Readonly<Record<string, unknown>>,
  sourceText: string,
  input: TaskActionUpdate,
): TaskActionPlan {
  const dueDate = input.dueDate === undefined ? undefined : taskDate(input.dueDate, 'Task due date')
  const nextDueDate = input.nextDueDate === undefined
    ? undefined
    : taskDate(input.nextDueDate, 'Task next due date')
  const repeatRule = input.repeatRule === undefined || input.repeatRule === null
    ? input.repeatRule
    : parseTaskRepeatRule(input.repeatRule)
  if (input.repeatRule !== undefined && input.repeatRule !== null && repeatRule === null)
    throw new TypeError('Task repeat rule is invalid')

  const nextAttrs = {
    ...sourceAttrs,
    ...(dueDate === undefined ? {} : { dueDate }),
    ...(repeatRule === undefined ? {} : { repeatRule }),
    ...(input.status === undefined ? {} : transitionTaskAttrs(sourceAttrs, input.status)),
  }
  const sourceRepeatRule = sourceAttrs.repeatRule === undefined || sourceAttrs.repeatRule === null
    ? null
    : parseTaskRepeatRule(sourceAttrs.repeatRule)
  if (sourceAttrs.repeatRule !== undefined && sourceAttrs.repeatRule !== null && sourceRepeatRule === null)
    throw new TypeError('Stored task repeat rule is invalid')

  if (!input.onlyThis
    && input.status === 'done'
    && nextDueDate !== undefined
    && sourceRepeatRule !== null) {
    return {
      current: {
        attrs: resetTaskForNextOccurrence(nextAttrs, nextDueDate),
        ...(input.text === undefined ? {} : { text: input.text }),
      },
    }
  }

  if (input.onlyThis) {
    if (nextDueDate === undefined)
      throw new TypeError('Editing one task occurrence requires the next series due date')
    return {
      current: { attrs: resetTaskForNextOccurrence(nextAttrs, nextDueDate) },
      occurrence: {
        attrs: {
          ...resetTaskForNextOccurrence(sourceAttrs, dueDate ?? null),
          repeatRule: null,
        },
        text: input.text ?? sourceText,
      },
    }
  }

  return {
    current: {
      attrs: nextAttrs,
      ...(input.text === undefined ? {} : { text: input.text }),
    },
  }
}
