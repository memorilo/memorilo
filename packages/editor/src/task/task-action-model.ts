import type { TaskReminder, TaskRepeatRule, TaskStatus } from '../schema/task-schema'
import { parseTaskDateTime, parseTaskDueDate, parseTaskReminderMinutes, parseTaskReminders, parseTaskRepeatRule, parseTaskTime, transitionTaskAttrs } from '../schema/task-schema'
import { resetTaskForNextOccurrence } from './task-completion'

export interface TaskActionUpdate {
  allDay?: boolean
  dueDate?: string | null
  dueTime?: string | null
  endAt?: string | null
  nextDueDate?: string | null
  onlyThis?: boolean
  reminderMinutes?: number | null
  reminders?: readonly TaskReminder[] | null
  repeatRule?: TaskRepeatRule | null
  startAt?: string | null
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

function taskTime(value: string | null, name: string): string | null {
  if (value === null)
    return null
  const parsed = parseTaskTime(value)
  if (parsed === null)
    throw new TypeError(`${name} must use HH:mm format`)
  return parsed
}

function taskDateTime(value: string | null, name: string): string | null {
  if (value === null)
    return null
  const parsed = parseTaskDateTime(value)
  if (parsed === null)
    throw new TypeError(`${name} must use YYYY-MM-DDTHH:mm format`)
  return parsed
}

function taskReminderMinutes(value: number | null): number | null {
  if (value === null)
    return null
  const parsed = parseTaskReminderMinutes(value)
  if (parsed === null)
    throw new TypeError('Task reminder must be an integer from 0 to 10080 minutes')
  return parsed
}

function taskReminders(value: readonly TaskReminder[] | null): readonly TaskReminder[] | null {
  if (value === null)
    return null
  const parsed = parseTaskReminders(value)
  if (parsed === null)
    throw new TypeError('Task reminders must contain at most 8 valid unique reminders')
  return parsed
}

function validateTaskSpan(startAt: string | null | undefined, endAt: string | null | undefined, dueDate: string | null | undefined): void {
  if (startAt === undefined && endAt === undefined)
    return
  if (startAt !== null && startAt !== undefined && endAt !== null && endAt !== undefined && endAt <= startAt)
    throw new RangeError('Task end time must be after its start time')
  if (dueDate !== null && dueDate !== undefined && startAt !== null && startAt !== undefined && startAt.slice(0, 10) !== dueDate)
    throw new RangeError('Task start time must use the task due date')
  if (dueDate !== null && dueDate !== undefined && endAt !== null && endAt !== undefined && endAt.slice(0, 10) < dueDate)
    throw new RangeError('Task end time cannot be before its due date')
}

export function planTaskAction(
  sourceAttrs: Readonly<Record<string, unknown>>,
  sourceText: string,
  input: TaskActionUpdate,
): TaskActionPlan {
  const dueDate = input.dueDate === undefined ? undefined : taskDate(input.dueDate, 'Task due date')
  if (input.allDay !== undefined && typeof input.allDay !== 'boolean')
    throw new TypeError('Task all-day flag must be a boolean')
  const dueTime = input.dueTime === undefined ? undefined : taskTime(input.dueTime, 'Task due time')
  const startAt = input.startAt === undefined ? undefined : taskDateTime(input.startAt, 'Task start time')
  const endAt = input.endAt === undefined ? undefined : taskDateTime(input.endAt, 'Task end time')
  const reminderMinutes = input.reminderMinutes === undefined ? undefined : taskReminderMinutes(input.reminderMinutes)
  const reminders = input.reminders === undefined ? undefined : taskReminders(input.reminders)
  const nextDueDate = input.nextDueDate === undefined
    ? undefined
    : taskDate(input.nextDueDate, 'Task next due date')
  const repeatRule = input.repeatRule === undefined || input.repeatRule === null
    ? input.repeatRule
    : parseTaskRepeatRule(input.repeatRule)
  if (input.repeatRule !== undefined && input.repeatRule !== null && repeatRule === null)
    throw new TypeError('Task repeat rule is invalid')
  validateTaskSpan(startAt, endAt, dueDate)

  const nextAttrs = {
    ...sourceAttrs,
    ...(input.allDay === undefined ? {} : { allDay: input.allDay }),
    ...(dueDate === undefined ? {} : { dueDate }),
    ...(dueTime === undefined ? {} : { dueTime }),
    ...(startAt === undefined ? {} : { startAt }),
    ...(endAt === undefined ? {} : { endAt }),
    ...(reminderMinutes === undefined ? {} : { reminderMinutes }),
    ...(reminders === undefined ? {} : { reminders }),
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
          ...resetTaskForNextOccurrence({
            ...sourceAttrs,
            allDay: nextAttrs.allDay,
            dueTime: nextAttrs.dueTime,
            endAt: nextAttrs.endAt,
            reminderMinutes: nextAttrs.reminderMinutes,
            reminders: nextAttrs.reminders,
            startAt: nextAttrs.startAt,
          }, dueDate ?? null),
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
