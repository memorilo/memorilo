import type { TFunction } from 'i18next'
import type { CSSProperties } from 'react'
import type { TaskReminder } from '../schema/task-schema'
import { Button, TextField } from '@memorilo/ui'
import * as stylex from '@stylexjs/stylex'
import { Check, Plus, X } from 'lucide-react'
import { useState } from 'react'
import { taskReminderLabel } from './task-reminder'
import { taskReminderPickerStyles as styles } from './task-reminder-picker.stylex'

export interface TaskReminderPickerProps {
  floatingOwnerId?: string
  floatingStyle: CSSProperties
  onChange: (value: readonly TaskReminder[]) => void
  onClear: () => void
  onClose: () => void
  onFloatingRef: (element: HTMLDivElement | null) => void
  reminders: readonly TaskReminder[]
  t: TFunction
}

const presetOffsets = [0, 5, 10, 30, 60, 1440] as const

function reminderKey(reminder: TaskReminder): string {
  return reminder.kind === 'offset' ? `offset:${reminder.minutes}` : `time:${reminder.time}`
}

function normalizedReminders(reminders: readonly TaskReminder[]): readonly TaskReminder[] {
  return [...new Map(reminders.map(reminder => [reminderKey(reminder), reminder])).values()]
    .sort((left, right) => reminderKey(left).localeCompare(reminderKey(right)))
}

export function TaskReminderPicker({
  floatingOwnerId,
  floatingStyle,
  onChange,
  onClear,
  onClose,
  onFloatingRef,
  reminders,
  t,
}: TaskReminderPickerProps) {
  const [customTime, setCustomTime] = useState('')
  const selectedKeys = new Set(reminders.map(reminderKey))
  const customReminders = reminders.filter(reminder => reminder.kind === 'time')
  const addCustomTime = () => {
    if (customTime.length === 0 || selectedKeys.has(`time:${customTime}`) || reminders.length >= 8)
      return
    onChange(normalizedReminders([...reminders, { kind: 'time', time: customTime }]))
    setCustomTime('')
  }
  const toggleOffset = (minutes: number) => {
    const key = `offset:${minutes}`
    onChange(selectedKeys.has(key)
      ? reminders.filter(reminder => reminderKey(reminder) !== key)
      : normalizedReminders([...reminders, { kind: 'offset', minutes }]))
  }

  return (
    <div
      ref={onFloatingRef}
      {...stylex.props(styles.popover)}
      data-task-action-floating-owner={floatingOwnerId}
      style={floatingStyle}
      role="dialog"
      aria-label={t('reminderSettings')}
    >
      <div {...stylex.props(styles.heading)}>
        <span>{t('reminderSettings')}</span>
        <Button variant="icon" xstyle={styles.iconButton} aria-label={t('close')} title={t('close')} type="button" onClick={onClose}>
          <X aria-hidden="true" size={14} strokeWidth={1.9} />
        </Button>
      </div>
      <div {...stylex.props(styles.options)} role="group" aria-label={t('reminderPresets')}>
        {presetOffsets.map((minutes) => {
          const selected = selectedKeys.has(`offset:${minutes}`)
          return (
            <button
              key={minutes}
              {...stylex.props(styles.option, selected && styles.optionSelected)}
              aria-checked={selected}
              disabled={!selected && reminders.length >= 8}
              role="checkbox"
              type="button"
              onClick={() => toggleOffset(minutes)}
            >
              <span {...stylex.props(styles.checkmark, selected && styles.checkmarkSelected)}>
                {selected ? <Check aria-hidden="true" size={11} strokeWidth={2.3} /> : null}
              </span>
              <span>{taskReminderLabel({ kind: 'offset', minutes }, t)}</span>
            </button>
          )
        })}
      </div>
      <div {...stylex.props(styles.customSection)}>
        <span {...stylex.props(styles.sectionLabel)}>{t('reminderCustomTime')}</span>
        <div {...stylex.props(styles.customInputRow)}>
          <TextField
            xstyle={styles.timeInput}
            aria-label={t('reminderCustomTime')}
            type="time"
            value={customTime}
            onChange={event => setCustomTime(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                addCustomTime()
              }
            }}
          />
          <Button
            variant="icon"
            xstyle={styles.addButton}
            aria-label={t('addReminder')}
            disabled={customTime.length === 0 || selectedKeys.has(`time:${customTime}`) || reminders.length >= 8}
            title={t('addReminder')}
            type="button"
            onClick={addCustomTime}
          >
            <Plus aria-hidden="true" size={15} strokeWidth={2} />
          </Button>
        </div>
        {customReminders.length > 0
          ? (
              <div {...stylex.props(styles.customList)}>
                {customReminders.map(reminder => (
                  <div key={reminder.time} {...stylex.props(styles.customItem)}>
                    <span>{reminder.time}</span>
                    <Button
                      variant="icon"
                      xstyle={styles.removeButton}
                      aria-label={t('removeReminder', { time: reminder.time })}
                      title={t('removeReminder', { time: reminder.time })}
                      type="button"
                      onClick={() => onChange(reminders.filter(item => reminderKey(item) !== reminderKey(reminder)))}
                    >
                      <X aria-hidden="true" size={12} strokeWidth={2} />
                    </Button>
                  </div>
                ))}
              </div>
            )
          : null}
      </div>
      <Button variant="plain" xstyle={styles.clearButton} disabled={reminders.length === 0} type="button" onClick={onClear}>{t('clearReminders')}</Button>
    </div>
  )
}
