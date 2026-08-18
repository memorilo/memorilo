import type { TFunction } from 'i18next'
import type { TaskReminder } from '../schema/task-schema'

export function taskReminderLabel(reminder: TaskReminder, t: TFunction): string {
  if (reminder.kind === 'time')
    return t('reminderAtCustomTime', { time: reminder.time })
  if (reminder.minutes === 0)
    return t('reminderAtTime')
  if (reminder.minutes % 1440 === 0)
    return t('reminderDaysBefore', { count: reminder.minutes / 1440 })
  if (reminder.minutes % 60 === 0)
    return t('reminderHoursBefore', { count: reminder.minutes / 60 })
  return t('reminderMinutesBefore', { count: reminder.minutes })
}
