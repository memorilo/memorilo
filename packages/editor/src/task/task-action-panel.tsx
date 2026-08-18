import type { Dayjs } from 'dayjs'
import type { TFunction } from 'i18next'
import type { CSSProperties, Ref } from 'react'
import type { TaskReminder, TaskRepeatRule, TaskStatus } from '../schema/task-schema'
import type { TaskActionUpdate } from './task-action-model'
import type { TaskCalendarEvent, TaskCalendarSubscription } from './task-calendar'
import type { TaskRepeatPickerMode } from './task-repeat-picker'
import { autoUpdate, FloatingPortal, offset, shift, size, useFloating } from '@floating-ui/react'
import * as stylex from '@stylexjs/stylex'
import dayjs from 'dayjs'
import {
  Bell,
  CalendarPlus2,
  CalendarX2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Moon,
  Repeat2,
  Sun,
  Sunrise,
} from 'lucide-react'
import { useId, useMemo, useState } from 'react'
import { buttonStyles } from '../ui/button/button.stylex'
import { floatingSurfaceStyles } from '../ui/floating-surface/floating-surface.stylex'
import { formControlStyles } from '../ui/form-controls/form-controls.stylex'
import { taskActionPanelStyles as styles } from './task-action-panel.stylex'
import { previewTaskRecurrenceDates } from './task-recurrence'
import { taskReminderLabel } from './task-reminder'
import { TaskReminderPicker } from './task-reminder-picker'
import { TaskRepeatPicker } from './task-repeat-picker'
import { TaskTimePicker } from './task-time-picker'

export interface TaskActionTask {
  dueDate: string | null
  dueTime: string | null
  endAt: string | null
  occurrenceDate: string
  reminderMinutes: number | null
  reminders: readonly TaskReminder[] | null
  repeatRule: TaskRepeatRule | null
  startAt: string | null
  status: TaskStatus
  text: string
}

export interface TaskActionPanelProps {
  calendarError?: string | null
  calendarEvents: readonly TaskCalendarEvent[]
  calendarLoading?: boolean
  calendarSubscriptions: readonly TaskCalendarSubscription[]
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

const quickDateOptions = [
  { icon: Sun, key: 'today' },
  { icon: Sunrise, key: 'tomorrow' },
  { icon: CalendarPlus2, key: 'nextWeek' },
  { icon: Moon, key: 'tonight' },
  { icon: CalendarX2, key: 'noDate' },
] as const

function monthDays(month: Dayjs): readonly Dayjs[] {
  const start = month.startOf('month').startOf('week')
  return Array.from({ length: 42 }, (_, index) => start.add(index, 'day'))
}

function dateTimeValue(date: string, time: string): string {
  return `${date}T${time}`
}

function translationLocale(t: TFunction): string | undefined {
  const locale = (t as TFunction & { lng?: unknown }).lng
  return typeof locale === 'string' ? locale : undefined
}

function isChinaRegion(t: TFunction): boolean {
  const locale = translationLocale(t) ?? ''
  const systemLocale = typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().locale : ''
  return /(?:^|[-_])CN(?:[-_]|$)/u.test(locale) || /(?:^|[-_])CN(?:[-_]|$)/u.test(systemLocale)
}

function repeatSummary(rule: TaskRepeatRule | null, t: TFunction): string {
  if (!rule)
    return t('repeatNone')
  const unit = t(`repeat${rule.unit.slice(0, 1).toUpperCase()}${rule.unit.slice(1)}`)
  const interval = rule.interval === 1 ? unit : `${rule.interval} ${unit}`
  return rule.endDate ? `${interval} · ${t('repeatUntilShort', { date: rule.endDate })}` : interval
}

function taskReminders(task: TaskActionTask): readonly TaskReminder[] {
  if (task.reminders !== null)
    return task.reminders
  return task.reminderMinutes === null ? [] : [{ kind: 'offset', minutes: task.reminderMinutes }]
}

function reminderSummary(reminders: readonly TaskReminder[], t: TFunction): string {
  if (reminders.length === 0)
    return t('reminderNone')
  if (reminders.length === 1)
    return taskReminderLabel(reminders[0]!, t)
  return t('reminderCount', { count: reminders.length })
}

export function TaskActionPanel({
  calendarError = null,
  calendarEvents,
  calendarLoading = false,
  calendarSubscriptions,
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
  const baseDate = task.dueDate ?? task.occurrenceDate
  const [mode, setMode] = useState<'date' | 'span'>(() => task.startAt !== null || task.endAt !== null ? 'span' : 'date')
  const [selectedDate, setSelectedDate] = useState<string | null>(() => task.dueDate ?? task.occurrenceDate)
  const [activeMonth, setActiveMonth] = useState(() => dayjs(task.dueDate ?? task.occurrenceDate).startOf('month'))
  const [dueTime, setDueTime] = useState(() => task.dueTime ?? '')
  const [startAt, setStartAt] = useState(() => task.startAt ?? dateTimeValue(baseDate, '09:00'))
  const [endAt, setEndAt] = useState(() => task.endAt ?? dateTimeValue(baseDate, '10:00'))
  const [reminders, setReminders] = useState<readonly TaskReminder[]>(() => taskReminders(task))
  const [repeatOpen, setRepeatOpen] = useState(() => task.repeatRule !== null)
  const [repeatPickerOpen, setRepeatPickerOpen] = useState(false)
  const [timePickerOpen, setTimePickerOpen] = useState(false)
  const [reminderPickerOpen, setReminderPickerOpen] = useState(false)
  const [repeatPickerMode, setRepeatPickerMode] = useState<TaskRepeatPickerMode>('presets')
  const [repeatDraft, setRepeatDraft] = useState<TaskRepeatRule>(() => task.repeatRule ?? {
    interval: 1,
    mode: 'due',
    unit: 'day',
    weekdays: [dayjs(task.occurrenceDate).day()],
  })
  const [repeatSnapshot, setRepeatSnapshot] = useState<TaskRepeatRule | null>(() => task.repeatRule)
  const [error, setError] = useState<string | null>(null)
  const [updating, setUpdating] = useState(false)
  const days = useMemo(() => monthDays(activeMonth), [activeMonth])
  const selectedCalendarId = (repeatDraft.calendarId ?? '').length > 0
    ? repeatDraft.calendarId ?? ''
    : calendarSubscriptions.find(subscription => subscription.enabled)?.id ?? ''
  const needsCalendar = repeatDraft.unit === 'holiday'
    || repeatDraft.skipHolidays === true
    || (repeatDraft.holidayPolicy !== undefined && repeatDraft.holidayPolicy !== 'allow')
  const repeatRule = useMemo<TaskRepeatRule>(() => ({
    ...repeatDraft,
    ...(needsCalendar && selectedCalendarId.length > 0 ? { calendarId: selectedCalendarId } : {}),
  }), [needsCalendar, repeatDraft, selectedCalendarId])
  const { refs, floatingStyles } = useFloating({
    open: repeatPickerOpen,
    onOpenChange: setRepeatPickerOpen,
    placement: 'bottom-start',
    middleware: [
      offset(8),
      shift({ padding: 8 }),
      size({ apply({ availableHeight, elements }) { Object.assign(elements.floating.style, { maxHeight: `${Math.max(0, availableHeight)}px` }) } }),
    ],
    whileElementsMounted: autoUpdate,
  })
  const { refs: timeRefs, floatingStyles: timeFloatingStyles } = useFloating({
    open: timePickerOpen,
    onOpenChange: setTimePickerOpen,
    placement: 'bottom-start',
    middleware: [offset(6), shift({ padding: 8 })],
    whileElementsMounted: autoUpdate,
  })
  const { refs: reminderRefs, floatingStyles: reminderFloatingStyles } = useFloating({
    open: reminderPickerOpen,
    onOpenChange: setReminderPickerOpen,
    placement: 'bottom-start',
    middleware: [offset(6), shift({ padding: 8 })],
    whileElementsMounted: autoUpdate,
  })
  const previewDates = useMemo(() => repeatOpen
    ? previewTaskRecurrenceDates(selectedDate ?? baseDate, repeatRule, {
        calendarEvents,
        from: activeMonth.startOf('month').format('YYYY-MM-DD'),
        through: activeMonth.endOf('month').format('YYYY-MM-DD'),
      })
    : [], [activeMonth, baseDate, calendarEvents, repeatOpen, repeatRule, selectedDate])

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

  const scheduleUpdate = (): TaskActionUpdate => {
    if (mode === 'span') {
      if (startAt.length === 0 || endAt.length === 0 || endAt <= startAt)
        throw new RangeError(t('timeSpanError'))
      return {
        dueDate: startAt.slice(0, 10),
        dueTime: null,
        endAt,
        reminders,
        startAt,
      }
    }
    return {
      dueDate: selectedDate,
      dueTime: selectedDate === null || dueTime.length === 0 ? null : dueTime,
      endAt: null,
      reminders,
      startAt: null,
    }
  }

  const save = () => {
    try {
      const schedule = scheduleUpdate()
      const repeat = repeatOpen ? repeatRule : null
      if (repeatOpen) {
        if (!Number.isSafeInteger(repeatRule.interval) || repeatRule.interval < 1 || repeatRule.interval > 999) {
          setError(t('repeatIntervalError'))
          return
        }
        if (needsCalendar && selectedCalendarId.length === 0) {
          setError(t('repeatCalendarError'))
          return
        }
        if (repeatRule.unit === 'week' && (repeatRule.weekdays?.length ?? 0) === 0) {
          setError(t('repeatWeekdayError'))
          return
        }
        if (repeatRule.mode === 'custom' && (repeatRule.anchorDate === undefined || repeatRule.anchorDate < baseDate)) {
          setError(t('repeatCustomDateError'))
          return
        }
        if (repeatRule.endDate !== undefined && selectedDate !== null && repeatRule.endDate < selectedDate) {
          setError(t('repeatEndDateError'))
          return
        }
      }
      void update({ ...schedule, repeatRule: repeat })
    }
    catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    }
  }

  const clear = () => {
    void update({
      dueDate: null,
      dueTime: null,
      endAt: null,
      reminderMinutes: null,
      reminders: null,
      repeatRule: null,
      startAt: null,
    })
  }

  const selectDate = (date: string | null) => {
    setSelectedDate(date)
    if (date !== null)
      setActiveMonth(dayjs(date).startOf('month'))
    if (mode === 'span' && date !== null) {
      setStartAt(current => `${date}T${current.slice(11)}`)
      setEndAt(current => `${date}T${current.slice(11)}`)
    }
  }

  const quickDate = (key: (typeof quickDateOptions)[number]['key']) => {
    const today = dayjs().startOf('day')
    if (key === 'noDate') {
      selectDate(null)
      setDueTime('')
      return
    }
    const date = key === 'today'
      ? today
      : key === 'tomorrow'
        ? today.add(1, 'day')
        : key === 'nextWeek'
          ? today.add(1, 'week').startOf('week').add(1, 'day')
          : today
    selectDate(date.format('YYYY-MM-DD'))
    if (key === 'tonight')
      setDueTime('20:00')
  }

  return (
    <div
      ref={panelRef}
      {...stylex.props(floatingSurfaceStyles.motion, floatingSurfaceStyles.surface, styles.panel)}
      aria-labelledby={headingId}
      id={id}
      role="dialog"
      style={{ ...style, visibility: visible ? 'visible' : 'hidden' }}
    >
      <strong id={headingId} {...stylex.props(styles.heading)}>{t('scheduleSettings')}</strong>
      <div {...stylex.props(styles.segmented)} role="tablist" aria-label={t('scheduleMode')}>
        <button
          {...stylex.props(styles.segment, mode === 'date' && styles.segmentSelected)}
          aria-selected={mode === 'date'}
          role="tab"
          type="button"
          onClick={() => {
            setMode('date')
            setTimePickerOpen(false)
            setReminderPickerOpen(false)
            setRepeatPickerOpen(false)
          }}
        >
          {t('scheduleDate')}
        </button>
        <button
          {...stylex.props(styles.segment, mode === 'span' && styles.segmentSelected)}
          aria-selected={mode === 'span'}
          role="tab"
          type="button"
          onClick={() => {
            setMode('span')
            setTimePickerOpen(false)
            setReminderPickerOpen(false)
            setRepeatPickerOpen(false)
          }}
        >
          {t('scheduleSpan')}
        </button>
      </div>

      {mode === 'date'
        ? (
            <>
              <div {...stylex.props(styles.quickDates)}>
                {quickDateOptions.map(({ icon: Icon, key }) => (
                  <button key={key} {...stylex.props(styles.quickDate)} aria-label={t(`quickDate${key.slice(0, 1).toUpperCase()}${key.slice(1)}`)} title={t(`quickDate${key.slice(0, 1).toUpperCase()}${key.slice(1)}`)} type="button" onClick={() => quickDate(key)}>
                    <Icon aria-hidden="true" size={16} strokeWidth={1.7} />
                  </button>
                ))}
              </div>
              <div {...stylex.props(styles.monthHeader)}>
                <button {...stylex.props(styles.iconButton)} aria-label={t('previousMonth')} title={t('previousMonth')} type="button" onClick={() => setActiveMonth(current => current.subtract(1, 'month'))}><ChevronLeft aria-hidden="true" size={15} /></button>
                <span>{new Intl.DateTimeFormat(translationLocale(t), { month: 'long', year: 'numeric' }).format(activeMonth.toDate())}</span>
                <button {...stylex.props(styles.iconButton)} aria-label={t('nextMonth')} title={t('nextMonth')} type="button" onClick={() => setActiveMonth(current => current.add(1, 'month'))}><ChevronRight aria-hidden="true" size={15} /></button>
              </div>
              <div {...stylex.props(styles.weekdays)} aria-hidden="true">
                {weekdayOptions.map(day => <span key={day.id}>{t(day.labelKey)}</span>)}
              </div>
              <div {...stylex.props(styles.calendarGrid)} role="grid" aria-label={t('scheduleDate')}>
                {days.map((day) => {
                  const date = day.format('YYYY-MM-DD')
                  const inMonth = day.month() === activeMonth.month()
                  const selected = date === selectedDate
                  const preview = previewDates.includes(date)
                  return (
                    <button key={date} {...stylex.props(styles.dayButton, !inMonth && styles.dayButtonMuted, preview && styles.dayButtonPreview, selected && styles.dayButtonSelected)} aria-label={date} aria-pressed={selected} type="button" onClick={() => selectDate(date)}>{day.date()}</button>
                  )
                })}
              </div>
            </>
          )
        : (
            <div {...stylex.props(styles.spanFields)}>
              <label {...stylex.props(styles.field)}>
                {t('spanStart')}
                <input {...stylex.props(formControlStyles.textInput, styles.dateTimeInput)} disabled={updating} type="datetime-local" value={startAt} onChange={event => setStartAt(event.target.value)} />
              </label>
              <label {...stylex.props(styles.field)}>
                {t('spanEnd')}
                <input {...stylex.props(formControlStyles.textInput, styles.dateTimeInput)} disabled={updating} type="datetime-local" value={endAt} onChange={event => setEndAt(event.target.value)} />
              </label>
            </div>
          )}

      <button
        ref={timeRefs.setReference}
        {...stylex.props(styles.settingRow)}
        disabled={updating || (mode === 'date' && selectedDate === null)}
        type="button"
        onClick={() => {
          if (mode === 'span') {
            setMode('date')
            setTimePickerOpen(false)
            setReminderPickerOpen(false)
            setRepeatPickerOpen(false)
            return
          }
          setRepeatPickerOpen(false)
          setTimePickerOpen(current => !current)
        }}
      >
        <Clock3 aria-hidden="true" size={15} strokeWidth={1.7} />
        <span>{t('time')}</span>
        <span {...stylex.props(styles.settingValue)}>{mode === 'span' ? `${startAt.slice(11)} – ${endAt.slice(11)}` : dueTime || t('notSet')}</span>
        <ChevronRight aria-hidden="true" size={14} />
      </button>
      {timePickerOpen && mode === 'date'
        ? (
            <FloatingPortal>
              <TaskTimePicker
                floatingStyle={timeFloatingStyles}
                floatingOwnerId={id}
                onChange={setDueTime}
                onClear={() => setDueTime('')}
                onClose={() => setTimePickerOpen(false)}
                onFloatingRef={timeRefs.setFloating}
                t={t}
                value={dueTime}
              />
            </FloatingPortal>
          )
        : null}
      <button
        ref={reminderRefs.setReference}
        {...stylex.props(styles.settingRow, reminders.length > 0 && styles.settingRowSelected)}
        disabled={updating}
        type="button"
        onClick={() => {
          setTimePickerOpen(false)
          setRepeatPickerOpen(false)
          setReminderPickerOpen(current => !current)
        }}
      >
        <Bell aria-hidden="true" size={15} strokeWidth={1.7} />
        <span>{t('reminder')}</span>
        <span {...stylex.props(styles.settingValue)}>{reminderSummary(reminders, t)}</span>
        <ChevronRight aria-hidden="true" size={14} />
      </button>
      {reminderPickerOpen
        ? (
            <FloatingPortal>
              <TaskReminderPicker
                floatingOwnerId={id}
                floatingStyle={reminderFloatingStyles}
                onChange={setReminders}
                onClear={() => setReminders([])}
                onClose={() => setReminderPickerOpen(false)}
                onFloatingRef={reminderRefs.setFloating}
                reminders={reminders}
                t={t}
              />
            </FloatingPortal>
          )
        : null}
      <button
        ref={refs.setReference}
        {...stylex.props(styles.settingRow, repeatOpen && styles.settingRowSelected)}
        disabled={updating}
        type="button"
        onClick={() => {
          setTimePickerOpen(false)
          setReminderPickerOpen(false)
          setRepeatSnapshot(repeatOpen ? repeatRule : null)
          setRepeatPickerMode('presets')
          setRepeatPickerOpen(true)
        }}
      >
        <Repeat2 aria-hidden="true" size={15} strokeWidth={1.7} />
        <span>{t('repeat')}</span>
        <span {...stylex.props(styles.settingValue)}>{repeatOpen ? repeatSummary(repeatRule, t) : t('repeatNone')}</span>
        <ChevronRight aria-hidden="true" size={14} />
      </button>
      {repeatPickerOpen
        ? (
            <FloatingPortal>
              <TaskRepeatPicker
                baseDate={selectedDate ?? baseDate}
                calendarEvents={calendarEvents}
                calendarSubscriptions={calendarSubscriptions}
                chinaRegion={isChinaRegion(t)}
                draft={repeatRule}
                floatingStyle={floatingStyles}
                floatingOwnerId={id}
                locale={translationLocale(t)}
                mode={repeatPickerMode}
                onCancel={() => {
                  if (repeatSnapshot !== null)
                    setRepeatDraft(repeatSnapshot)
                  setRepeatOpen(repeatSnapshot !== null)
                  setRepeatPickerOpen(false)
                }}
                onChange={(next) => {
                  setRepeatDraft(next)
                  setRepeatOpen(true)
                }}
                onClose={() => setRepeatPickerOpen(false)}
                onDisable={() => {
                  setRepeatOpen(false)
                  setRepeatPickerOpen(false)
                }}
                onEditCustom={() => setRepeatPickerMode('custom')}
                onFloatingRef={refs.setFloating}
                t={t}
              />
            </FloatingPortal>
          )
        : null}
      {calendarError !== null ? <span {...stylex.props(styles.error)} role="alert">{t('couldNotLoadCalendars', { message: calendarError })}</span> : calendarLoading ? <span {...stylex.props(styles.status)} role="status">{t('loadingCalendars')}</span> : null}
      {error !== null ? <span {...stylex.props(styles.error)} role="alert">{error}</span> : null}
      <div {...stylex.props(styles.footer)}>
        <button {...stylex.props(buttonStyles.action, styles.footerButton)} disabled={updating} type="button" onClick={clear}>{t('clearSchedule')}</button>
        <button {...stylex.props(formControlStyles.primaryButton, styles.footerButton, styles.primaryAction)} disabled={updating} type="button" onClick={save}>{t('confirmSchedule')}</button>
      </div>
    </div>
  )
}
