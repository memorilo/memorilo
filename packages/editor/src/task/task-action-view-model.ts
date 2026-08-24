import type { Dayjs } from 'dayjs'
import type { TFunction } from 'i18next'
import type { TaskReminder, TaskRepeatRule } from '../schema/task-schema'
import type { TaskActionTask } from './task-action-panel'
import i18next from 'i18next'
import { taskReminderLabel } from './task-reminder'

export function monthDays(month: Dayjs): readonly Dayjs[] {
  const start = month.startOf('month').startOf('week')
  return Array.from({ length: 42 }, (_, index) => start.add(index, 'day'))
}

export function dateTimeValue(date: string, time: string): string {
  return `${date}T${time}`
}

export function translationLocale(): string | undefined {
  return i18next.resolvedLanguage ?? i18next.language
}

export function isChinaRegion(): boolean {
  const locale = translationLocale() ?? ''
  const systemLocale = typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().locale : ''
  return /^zh(?:[-_]|$)/iu.test(locale)
    || /(?:^|[-_])CN(?:[-_]|$)/u.test(locale)
    || /(?:^|[-_])CN(?:[-_]|$)/u.test(systemLocale)
}

export function repeatSummary(rule: TaskRepeatRule | null, t: TFunction): string {
  if (!rule)
    return t('repeatNone')
  const unit = t(`repeat${rule.unit.slice(0, 1).toUpperCase()}${rule.unit.slice(1)}`)
  const interval = rule.interval === 1 ? unit : `${rule.interval} ${unit}`
  return rule.endDate ? `${interval} · ${t('repeatUntilShort', { date: rule.endDate })}` : interval
}

export function taskReminders(task: TaskActionTask): readonly TaskReminder[] {
  if (task.reminders !== null)
    return task.reminders
  return task.reminderMinutes === null ? [] : [{ kind: 'offset', minutes: task.reminderMinutes }]
}

export function reminderSummary(reminders: readonly TaskReminder[], t: TFunction): string {
  if (reminders.length === 0)
    return t('reminderNone')
  if (reminders.length === 1)
    return taskReminderLabel(reminders[0]!, t)
  return t('reminderCount', { count: reminders.length })
}
