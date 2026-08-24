import type { Dayjs } from 'dayjs'
import type { TFunction } from 'i18next'
import type {
  TaskRepeatDayOfMonth,
  TaskRepeatOrdinal,
  TaskRepeatRule,
  TaskRepeatUnit,
} from '../schema/task-schema'
import dayjs from 'dayjs'
import { lunarDateForGregorian } from './task-recurrence'

export const weekdayKeys = [
  'weekdaySunday',
  'weekdayMonday',
  'weekdayTuesday',
  'weekdayWednesday',
  'weekdayThursday',
  'weekdayFriday',
  'weekdaySaturday',
] as const

export const ordinalKeys: readonly { value: TaskRepeatOrdinal, key: string }[] = [
  { key: 'repeatFirst', value: 1 },
  { key: 'repeatSecond', value: 2 },
  { key: 'repeatThird', value: 3 },
  { key: 'repeatFourth', value: 4 },
  { key: 'repeatFifth', value: 5 },
  { key: 'repeatLast', value: -1 },
]

export const dayOfMonthOptions: readonly { value: TaskRepeatDayOfMonth, label: string }[] = [
  ...Array.from({ length: 31 }, (_, index) => ({ label: String(index + 1), value: index + 1 })),
  { label: 'last', value: 'last' },
]

export function monthDays(month: Dayjs): readonly Dayjs[] {
  const start = month.startOf('month').startOf('week')
  return Array.from({ length: 42 }, (_, index) => start.add(index, 'day'))
}

export function isPreset(rule: TaskRepeatRule, unit: TaskRepeatUnit): boolean {
  if (rule.unit !== unit || rule.interval !== 1 || rule.mode === 'custom')
    return false
  if (unit === 'week')
    return rule.weekdays?.length === 1
  if (unit === 'month')
    return rule.monthMode === undefined || rule.monthMode === 'date'
  if (unit === 'year')
    return rule.yearMode === undefined || rule.yearMode === 'date'
  return true
}

function unitLabel(unit: TaskRepeatUnit, t: TFunction): string {
  return t(`repeat${unit.slice(0, 1).toUpperCase()}${unit.slice(1)}`)
}

export function ruleSummary(rule: TaskRepeatRule, baseDate: string, t: TFunction): string {
  if (rule.unit === 'week' && rule.weekdays?.length) {
    const names = rule.weekdays.map(day => t(weekdayKeys[day] ?? weekdayKeys[0])).join(', ')
    return `${t('repeatEvery')} ${rule.interval} ${unitLabel(rule.unit, t)} · ${names}`
  }
  if (rule.unit === 'month' && rule.monthMode === 'weekday')
    return `${t('repeatEvery')} ${rule.interval} ${unitLabel(rule.unit, t)} · ${t('repeatOrdinalWeekday', { ordinal: t(ordinalKeys.find(item => item.value === (rule.monthOrdinal ?? 1))?.key ?? 'repeatFirst'), weekday: t(weekdayKeys[rule.monthWeekday ?? dayjs(baseDate).day()] ?? weekdayKeys[0]) })}`
  if (rule.unit === 'month' && rule.monthMode === 'workday')
    return `${t('repeatEvery')} ${rule.interval} ${unitLabel(rule.unit, t)} · ${t('repeatOrdinalWorkday', { ordinal: t(ordinalKeys.find(item => item.value === (rule.monthOrdinal ?? 1))?.key ?? 'repeatFirst') })}`
  if (rule.unit === 'lunar')
    return `${t('repeatEvery')} ${rule.interval} ${unitLabel(rule.unit, t)} · ${rule.lunarMonth}/${rule.lunarDay}`
  return `${t('repeatEvery')} ${rule.interval} ${unitLabel(rule.unit, t)}`
}

export function withDefaults(rule: TaskRepeatRule, baseDate: string): TaskRepeatRule {
  const value = dayjs(baseDate)
  return {
    ...rule,
    ...(rule.mode === 'custom' ? { anchorDate: rule.anchorDate ?? baseDate } : {}),
    ...(rule.unit === 'month' ? { monthDay: rule.monthDay ?? value.date(), monthMode: rule.monthMode ?? 'date', monthOrdinal: rule.monthOrdinal ?? 1, monthWeekday: rule.monthWeekday ?? value.day() } : {}),
    ...(rule.unit === 'year' ? { yearDay: rule.yearDay ?? value.date(), yearMode: rule.yearMode ?? 'date', yearMonth: rule.yearMonth ?? value.month() + 1, yearOrdinal: rule.yearOrdinal ?? 1, yearWeekday: rule.yearWeekday ?? value.day() } : {}),
    ...(rule.unit === 'lunar'
      ? (() => {
          const lunar = lunarDateForGregorian(baseDate)
          return { lunarDay: rule.lunarDay ?? lunar.day, lunarMonth: rule.lunarMonth ?? lunar.month }
        })()
      : {}),
  }
}

export function presetRule(unit: TaskRepeatUnit, baseDate: string, calendarId: string, current: TaskRepeatRule): TaskRepeatRule {
  const value = dayjs(baseDate)
  const base = { ...current, interval: 1, mode: 'due' as const, unit, ...(calendarId.length > 0 ? { calendarId } : {}) }
  if (unit === 'week')
    return { ...base, weekdays: [value.day()] }
  if (unit === 'month')
    return { ...base, monthDay: value.date(), monthMode: 'date' }
  if (unit === 'year')
    return { ...base, yearDay: value.date(), yearMode: 'date', yearMonth: value.month() + 1 }
  if (unit === 'lunar') {
    const lunar = lunarDateForGregorian(baseDate)
    return { ...base, lunarDay: lunar.day, lunarMonth: lunar.month }
  }
  if (unit === 'day')
    return { ...base, skipHolidays: false, skipWeekends: false }
  if (unit === 'holiday')
    return { ...base, holidayPolicy: 'allow' }
  return { ...current, ...base }
}

export function dateFormat(date: Dayjs, locale: string | undefined): string {
  return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric' }).format(date.toDate())
}

export function monthFormat(date: Dayjs, locale: string | undefined): string {
  return new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(date.toDate())
}
