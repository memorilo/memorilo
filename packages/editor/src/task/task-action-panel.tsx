import type { TFunction } from 'i18next'
import type { CSSProperties, Ref } from 'react'
import type { TaskRepeatRule, TaskStatus } from '../schema/task-schema'
import type { TaskActionUpdate } from './task-action-model'
import type { TaskCalendarEvent, TaskCalendarSubscription } from './task-calendar'
import * as stylex from '@stylexjs/stylex'
import dayjs from 'dayjs'
import { useId, useState } from 'react'
import { buttonStyles } from '../ui/button/button.stylex'
import { floatingSurfaceStyles } from '../ui/floating-surface/floating-surface.stylex'
import { formControlStyles } from '../ui/form-controls/form-controls.stylex'
import { taskActionPanelStyles as styles } from './task-action-panel.stylex'
import { nextTaskOccurrenceDate, taskRepeatBaseDate } from './task-recurrence'

export interface TaskActionTask {
  dueDate: string | null
  occurrenceDate: string
  repeatRule: TaskRepeatRule | null
  status: TaskStatus
  text: string
}

export interface TaskActionPanelProps {
  calendarError?: string | null
  calendarEvents: readonly TaskCalendarEvent[]
  calendarLoading?: boolean
  calendarSubscriptions: readonly TaskCalendarSubscription[]
  editText?: boolean
  id?: string
  panelRef?: Ref<HTMLDivElement>
  style?: CSSProperties
  t: TFunction
  task: TaskActionTask
  visible?: boolean
  onUpdate: (input: TaskActionUpdate) => Promise<void> | void
  onUpdated?: () => void
}

const weekdayOptions = [
  { id: 0, labelKey: 'weekdaySunday' },
  { id: 1, labelKey: 'weekdayMonday' },
  { id: 2, labelKey: 'weekdayTuesday' },
  { id: 3, labelKey: 'weekdayWednesday' },
  { id: 4, labelKey: 'weekdayThursday' },
  { id: 5, labelKey: 'weekdayFriday' },
  { id: 6, labelKey: 'weekdaySaturday' },
] as const

export function TaskActionPanel({
  calendarError = null,
  calendarEvents,
  calendarLoading = false,
  calendarSubscriptions,
  editText = true,
  id,
  onUpdate,
  onUpdated,
  panelRef,
  style,
  t,
  task,
  visible = true,
}: TaskActionPanelProps) {
  const headingId = useId()
  const initialCalendarId = task.repeatRule?.calendarId
    ?? calendarSubscriptions.find(subscription => subscription.enabled)?.id
    ?? ''
  const [interval, setInterval] = useState(String(task.repeatRule?.interval ?? 1))
  const [unit, setUnit] = useState<TaskRepeatRule['unit']>(task.repeatRule?.unit ?? 'day')
  const [mode, setMode] = useState<TaskRepeatRule['mode']>(task.repeatRule?.mode ?? 'due')
  const [holidayPolicy, setHolidayPolicy] = useState<TaskRepeatRule['holidayPolicy']>(task.repeatRule?.holidayPolicy ?? 'allow')
  const [calendarId, setCalendarId] = useState(initialCalendarId)
  const [weekdays, setWeekdays] = useState<readonly number[]>(() => task.repeatRule?.weekdays?.length
    ? [...new Set(task.repeatRule.weekdays)].sort((left, right) => left - right)
    : [dayjs(task.occurrenceDate).day()])
  const [dueDate, setDueDate] = useState(task.dueDate ?? task.occurrenceDate)
  const [text, setText] = useState(task.text)
  const [error, setError] = useState<string | null>(null)
  const [updating, setUpdating] = useState(false)
  const selectedCalendarId = calendarId.length > 0
    ? calendarId
    : calendarSubscriptions.find(subscription => subscription.enabled)?.id ?? ''
  const needsCalendar = unit === 'holiday' || holidayPolicy !== 'allow'
  const repeatRule: TaskRepeatRule = {
    ...(needsCalendar && selectedCalendarId.length > 0 ? { calendarId: selectedCalendarId } : {}),
    ...(unit === 'holiday' ? {} : { holidayPolicy }),
    interval: Number(interval),
    mode,
    unit,
    ...(unit === 'week' ? { weekdays } : {}),
  }

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
  const saveRepeat = () => {
    if (!Number.isSafeInteger(repeatRule.interval) || repeatRule.interval < 1 || repeatRule.interval > 999) {
      setError(t('repeatIntervalError'))
      return
    }
    if (needsCalendar && selectedCalendarId.length === 0) {
      setError(t('repeatCalendarError'))
      return
    }
    if (unit === 'week' && weekdays.length === 0) {
      setError(t('repeatWeekdayError'))
      return
    }
    void update({ dueDate, repeatRule })
  }
  const runOccurrenceAction = (action: () => TaskActionUpdate) => {
    try {
      void update(action())
    }
    catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    }
  }
  const skip = () => runOccurrenceAction(() => {
    if (!task.repeatRule)
      throw new Error('Skipping an occurrence requires a repeat rule')
    return {
      dueDate: nextTaskOccurrenceDate(task.occurrenceDate, task.repeatRule, calendarEvents),
      repeatRule: task.repeatRule,
    }
  })
  const complete = () => runOccurrenceAction(() => {
    if (!task.repeatRule)
      throw new Error('Completing an occurrence requires a repeat rule')
    const completedOn = dayjs().format('YYYY-MM-DD')
    const baseDate = taskRepeatBaseDate(task.occurrenceDate, task.repeatRule, completedOn)
    return {
      nextDueDate: nextTaskOccurrenceDate(baseDate, task.repeatRule, calendarEvents),
      status: 'done',
    }
  })
  const onlyThis = () => runOccurrenceAction(() => {
    if (!task.repeatRule)
      throw new Error('Editing one occurrence requires a repeat rule')
    return {
      dueDate,
      nextDueDate: nextTaskOccurrenceDate(task.occurrenceDate, task.repeatRule, calendarEvents),
      onlyThis: true,
      ...(editText ? { text } : {}),
    }
  })
  const toggleWeekday = (weekday: number) => {
    setWeekdays((current) => {
      if (!current.includes(weekday))
        return [...current, weekday].sort((left, right) => left - right)
      if (current.length === 1)
        return current
      return current.filter(item => item !== weekday)
    })
  }
  const missingSelectedCalendar = selectedCalendarId.length > 0
    && !calendarSubscriptions.some(subscription => subscription.id === selectedCalendarId)

  return (
    <div
      ref={panelRef}
      {...stylex.props(floatingSurfaceStyles.motion, floatingSurfaceStyles.surface, styles.panel)}
      aria-labelledby={headingId}
      id={id}
      role="dialog"
      style={{ ...style, visibility: visible ? 'visible' : 'hidden' }}
    >
      <strong id={headingId} {...stylex.props(styles.heading)}>{t('repeatSettings')}</strong>
      <label {...stylex.props(styles.field)}>
        {t('repeatEvery')}
        <input {...stylex.props(formControlStyles.textInput, styles.input)} disabled={updating} min={1} max={999} type="number" value={interval} onChange={event => setInterval(event.target.value)} />
      </label>
      <label {...stylex.props(styles.field)}>
        {t('repeatUnit')}
        <select {...stylex.props(formControlStyles.textInput, styles.select)} disabled={updating} value={unit} onChange={event => setUnit(event.target.value as TaskRepeatRule['unit'])}>
          <option value="day">{t('repeatDay')}</option>
          <option value="week">{t('repeatWeek')}</option>
          <option value="month">{t('repeatMonth')}</option>
          <option value="year">{t('repeatYear')}</option>
          <option value="holiday">{t('repeatHoliday')}</option>
        </select>
      </label>
      {unit === 'week'
        ? (
            <div {...stylex.props(styles.weekdayField)}>
              <span {...stylex.props(styles.weekdayLabel)}>{t('repeatOn')}</span>
              <div {...stylex.props(styles.weekdayControl)} aria-label={t('repeatOn')} role="group">
                {weekdayOptions.map(weekday => (
                  <button
                    key={weekday.id}
                    {...stylex.props(buttonStyles.action, styles.weekdayButton, weekdays.includes(weekday.id) && styles.weekdayButtonSelected)}
                    aria-pressed={weekdays.includes(weekday.id)}
                    disabled={updating}
                    title={t(weekday.labelKey)}
                    type="button"
                    onClick={() => toggleWeekday(weekday.id)}
                  >
                    {t(weekday.labelKey)}
                  </button>
                ))}
              </div>
            </div>
          )
        : null}
      <label {...stylex.props(styles.field)}>
        {t('repeatMode')}
        <select {...stylex.props(formControlStyles.textInput, styles.select)} disabled={updating} value={mode} onChange={event => setMode(event.target.value as TaskRepeatRule['mode'])}>
          <option value="due">{t('repeatDue')}</option>
          <option value="completion">{t('repeatCompletion')}</option>
        </select>
      </label>
      {unit !== 'holiday'
        ? (
            <label {...stylex.props(styles.field)}>
              {t('holidayPolicy')}
              <select {...stylex.props(formControlStyles.textInput, styles.select)} disabled={updating} value={holidayPolicy} onChange={event => setHolidayPolicy(event.target.value as TaskRepeatRule['holidayPolicy'])}>
                <option value="allow">{t('holidayAllow')}</option>
                <option value="skip">{t('holidaySkip')}</option>
                <option value="next-workday">{t('holidayNextWorkday')}</option>
              </select>
            </label>
          )
        : null}
      {needsCalendar
        ? (
            <label {...stylex.props(styles.field)}>
              {t('repeatCalendar')}
              <select
                {...stylex.props(formControlStyles.textInput, styles.select, styles.selectWide)}
                disabled={updating || calendarLoading}
                value={selectedCalendarId}
                onChange={event => setCalendarId(event.target.value)}
              >
                {selectedCalendarId.length === 0
                  ? <option value="">{calendarLoading ? t('loadingCalendars') : t('selectCalendar')}</option>
                  : null}
                {missingSelectedCalendar ? <option value={selectedCalendarId}>{t('missingCalendar', { id: selectedCalendarId })}</option> : null}
                {calendarSubscriptions.map(subscription => (
                  <option key={subscription.id} disabled={!subscription.enabled && subscription.id !== selectedCalendarId} value={subscription.id}>
                    {subscription.title}
                  </option>
                ))}
              </select>
            </label>
          )
        : null}
      <label {...stylex.props(styles.field)}>
        {t('repeatStartDate')}
        <input {...stylex.props(formControlStyles.textInput, styles.input, styles.dateInput)} disabled={updating} type="date" value={dueDate} onChange={event => setDueDate(event.target.value)} />
      </label>
      <button {...stylex.props(formControlStyles.primaryButton, styles.action, styles.primaryAction)} disabled={updating} type="button" onClick={saveRepeat}>{t('saveRepeat')}</button>
      {task.repeatRule
        ? (
            <>
              <div {...stylex.props(styles.divider)} />
              {editText
                ? (
                    <label {...stylex.props(styles.field)}>
                      {t('onlyThisText')}
                      <input {...stylex.props(formControlStyles.textInput, styles.textInput)} disabled={updating} value={text} onChange={event => setText(event.target.value)} />
                    </label>
                  )
                : null}
              <button {...stylex.props(buttonStyles.action, styles.action)} disabled={updating} type="button" onClick={skip}>{t('skipThis')}</button>
              <button {...stylex.props(buttonStyles.action, styles.action)} disabled={updating} type="button" onClick={onlyThis}>{t('onlyThis')}</button>
              <button {...stylex.props(formControlStyles.primaryButton, styles.action, styles.primaryAction)} disabled={updating} type="button" onClick={complete}>{t('completeAndRepeat')}</button>
            </>
          )
        : null}
      {calendarError !== null
        ? <span {...stylex.props(styles.error)} role="alert">{t('couldNotLoadCalendars', { message: calendarError })}</span>
        : calendarLoading
          ? <span {...stylex.props(styles.status)} role="status">{t('loadingCalendars')}</span>
          : null}
      {error !== null ? <span {...stylex.props(styles.error)} role="alert">{error}</span> : null}
    </div>
  )
}
