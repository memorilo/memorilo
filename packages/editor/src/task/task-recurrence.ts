import type { Dayjs } from 'dayjs'
import type { TaskRepeatRule } from '../schema/task-schema'
import type { TaskCalendarEvent } from './task-calendar'
import dayjs from 'dayjs'

function dateValue(date: string): Dayjs {
  const parsed = dayjs(date)
  if (!parsed.isValid() || parsed.format('YYYY-MM-DD') !== date)
    throw new TypeError(`Invalid task date: ${date}`)
  return parsed.startOf('day')
}

function calendarDates(
  rule: TaskRepeatRule,
  calendarEvents: readonly TaskCalendarEvent[],
): readonly string[] {
  const needsCalendar = rule.unit === 'holiday'
    || (rule.holidayPolicy !== undefined && rule.holidayPolicy !== 'allow')
  if (!needsCalendar)
    return []
  if (rule.calendarId === undefined)
    throw new TypeError('Task repeat rule requires a calendar subscription')
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
    throw new Error('Weekly task recurrence does not have a selected weekday')
  return current.subtract(current.day(), 'day').add(interval, 'week').add(first, 'day')
}

function nextRegularOccurrence(current: Dayjs, rule: TaskRepeatRule): Dayjs {
  if (rule.unit === 'day')
    return current.add(rule.interval, 'day')
  if (rule.unit === 'week') {
    return rule.weekdays
      ? nextWeeklyOccurrence(current, rule.interval, rule.weekdays)
      : current.add(rule.interval, 'week')
  }
  if (rule.unit === 'month')
    return current.add(rule.interval, 'month')
  if (rule.unit === 'year')
    return current.add(rule.interval, 'year')
  throw new TypeError('Holiday task recurrence requires calendar events')
}

function nextWorkday(date: Dayjs, holidays: ReadonlySet<string>): Dayjs {
  let next = date
  while (holidays.has(next.format('YYYY-MM-DD')) || next.day() === 0 || next.day() === 6)
    next = next.add(1, 'day')
  return next
}

export function taskRepeatBaseDate(
  occurrenceDate: string,
  rule: TaskRepeatRule,
  completedOn: string,
): string {
  dateValue(occurrenceDate)
  dateValue(completedOn)
  return rule.mode === 'completion' ? completedOn : occurrenceDate
}

export function nextTaskOccurrenceDate(
  currentDate: string,
  rule: TaskRepeatRule,
  calendarEvents: readonly TaskCalendarEvent[] = [],
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
    return (rule.holidayPolicy === 'next-workday'
      ? nextWorkday(occurrence, holidays)
      : occurrence).format('YYYY-MM-DD')
  }
  let next = nextRegularOccurrence(current, rule)
  if (rule.holidayPolicy === 'next-workday') {
    next = nextWorkday(next, holidays)
  }
  else if (rule.holidayPolicy === 'skip') {
    for (let attempts = 0; holidays.has(next.format('YYYY-MM-DD')); attempts += 1) {
      if (attempts >= 2048)
        throw new RangeError('Task recurrence could not find a non-holiday occurrence')
      next = nextRegularOccurrence(next, rule)
    }
  }
  return next.format('YYYY-MM-DD')
}
