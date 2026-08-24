import type { TFunction } from 'i18next'
import type { CSSProperties, Ref } from 'react'
import type { TaskActionUpdate } from './task-action-model'
import type { TaskActionTask } from './task-action-panel'
import type { TaskCalendarEvent } from './task-calendar'
import { Button, Surface, TextField } from '@memorilo/ui'
import * as stylex from '@stylexjs/stylex'
import dayjs from 'dayjs'
import { useId, useState } from 'react'
import { editorPositionerAdapterStyles } from '../ui/floating-surface/editor-positioner-adapter.stylex'
import { taskActionPanelStyles as styles } from './task-action-panel.stylex'
import { nextTaskOccurrenceDate, taskRepeatBaseDate, taskRepeatContinuesOn } from './task-recurrence'

export interface TaskOccurrencePanelProps {
  calendarEvents: readonly TaskCalendarEvent[]
  id?: string
  panelRef?: Ref<HTMLDivElement>
  style?: CSSProperties
  t: TFunction
  task: TaskActionTask
  visible?: boolean
  onUpdate: (input: TaskActionUpdate) => Promise<void> | void
  onUpdated?: () => void
}

export function TaskOccurrencePanel({
  calendarEvents,
  id,
  onUpdate,
  onUpdated,
  panelRef,
  style,
  t,
  task,
  visible = true,
}: TaskOccurrencePanelProps) {
  const headingId = useId()
  const [text, setText] = useState(() => task.text)
  const [error, setError] = useState<string | null>(null)
  const [updating, setUpdating] = useState(false)

  const update = async (input: TaskActionUpdate) => {
    setError(null)
    setUpdating(true)
    try {
      await onUpdate(input)
      onUpdated?.()
    }
    catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    }
    finally {
      setUpdating(false)
    }
  }

  const run = (action: () => TaskActionUpdate) => {
    try {
      void update(action())
    }
    catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    }
  }

  const skip = () => run(() => {
    if (!task.repeatRule)
      throw new Error('Skipping an occurrence requires a repeat rule')
    const nextDate = nextTaskOccurrenceDate(task.occurrenceDate, task.repeatRule, calendarEvents)
    return taskRepeatContinuesOn(nextDate, task.repeatRule)
      ? {
          dueDate: nextDate,
          repeatRule: task.repeatRule,
        }
      : {
          repeatRule: null,
          status: 'done',
        }
  })

  const onlyThis = () => run(() => {
    if (!task.repeatRule)
      throw new Error('Editing one occurrence requires a repeat rule')
    return {
      dueDate: task.dueDate ?? task.occurrenceDate,
      allDay: task.allDay,
      dueTime: task.dueTime,
      endAt: task.endAt,
      nextDueDate: nextTaskOccurrenceDate(task.occurrenceDate, task.repeatRule, calendarEvents),
      onlyThis: true,
      reminderMinutes: task.reminderMinutes,
      reminders: task.reminders,
      startAt: task.startAt,
      text,
    }
  })

  const complete = () => run(() => {
    if (!task.repeatRule)
      throw new Error('Completing an occurrence requires a repeat rule')
    const completedOn = dayjs().format('YYYY-MM-DD')
    const baseDate = taskRepeatBaseDate(task.occurrenceDate, task.repeatRule, completedOn)
    const nextDate = nextTaskOccurrenceDate(baseDate, task.repeatRule, calendarEvents)
    return taskRepeatContinuesOn(nextDate, task.repeatRule)
      ? { nextDueDate: nextDate, status: 'done' }
      : { repeatRule: null, status: 'done' }
  })

  return (
    <Surface
      asChild
      variant="popover"
      xstyle={[editorPositionerAdapterStyles.motion, styles.panel]}
    >
      <div
        ref={panelRef}
        aria-labelledby={headingId}
        id={id}
        role="dialog"
        style={{ ...style, visibility: visible ? 'visible' : 'hidden' }}
      >
        <strong id={headingId} {...stylex.props(styles.heading)}>{t('occurrenceActions')}</strong>
        <label {...stylex.props(styles.field)}>
          {t('onlyThisTaskText')}
          <TextField xstyle={styles.textInput} disabled={updating} value={text} onChange={event => setText(event.target.value)} />
        </label>
        {error !== null ? <span {...stylex.props(styles.error)} role="alert">{error}</span> : null}
        <div {...stylex.props(styles.divider)} />
        <Button variant="plain" xstyle={styles.action} disabled={updating} type="button" onClick={skip}>{t('skipThis')}</Button>
        <Button variant="plain" xstyle={styles.action} disabled={updating} type="button" onClick={onlyThis}>{t('onlyThis')}</Button>
        <Button variant="primary" xstyle={[styles.action, styles.primaryAction]} disabled={updating} type="button" onClick={complete}>{t('completeAndRepeat')}</Button>
      </div>
    </Surface>
  )
}
