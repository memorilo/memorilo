import type { DesktopTodoCalendarEvent, DesktopTodoCalendarSubscription, DesktopTodoRepeatRule, DesktopTodoTask } from '@memorilo/desktop-api'
import type { TFunction } from 'i18next'
import { autoUpdate, flip, FloatingPortal, offset, shift, size, useFloating, useMergeRefs } from '@floating-ui/react'
import * as stylex from '@stylexjs/stylex'
import dayjs from 'dayjs'
import { MoreHorizontal } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import { floatingTransformOrigin } from '../../shared/floating-ui'
import { nextTodoOccurrenceDate, taskOccurrenceDate, taskRepeatBaseDate } from './todo-model'
import { todoTaskActionStyles as styles } from './todo-task-actions.stylex'

interface TodoTaskActionsProps {
  compact?: boolean
  compactAlignment?: 'left' | 'right'
  calendarEvents: readonly DesktopTodoCalendarEvent[]
  calendarSubscriptions: readonly DesktopTodoCalendarSubscription[]
  onUpdateTask: (input: {
    blockId: string
    dueDate?: string | null
    nextDueDate?: string | null
    noteId: string
    onlyThis?: boolean
    repeatRule?: DesktopTodoRepeatRule | null
    status?: DesktopTodoTask['status']
    text?: string
    topicId: string
  }) => Promise<void>
  t: TFunction
  task: DesktopTodoTask
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

const menuGap = 4
const viewportInset = 8

function taskActionRevision(task: DesktopTodoTask, calendarSubscriptions: readonly DesktopTodoCalendarSubscription[]): string {
  return JSON.stringify([
    task.blockId,
    task.dueDate,
    task.repeatRule,
    task.text,
    calendarSubscriptions.map(subscription => [subscription.id, subscription.enabled]),
  ])
}

function TodoTaskActionsForm({ calendarEvents, calendarSubscriptions, compact = false, compactAlignment = 'right', onUpdateTask, t, task }: TodoTaskActionsProps) {
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const menuId = useId()
  const headingId = useId()
  const [open, setOpen] = useState(false)
  const preferredPlacement = compact
    ? compactAlignment === 'left' ? 'top-start' : 'top-end'
    : 'bottom-end'
  const {
    floatingStyles,
    isPositioned,
    placement,
    refs,
  } = useFloating({
    middleware: [
      offset(menuGap),
      flip({ padding: viewportInset }),
      shift({ padding: viewportInset }),
      size({
        padding: viewportInset,
        apply({ availableHeight, elements }) {
          elements.floating.style.maxHeight = `${Math.max(0, availableHeight)}px`
        },
      }),
    ],
    open,
    placement: preferredPlacement,
    strategy: 'fixed',
    transform: false,
    whileElementsMounted: autoUpdate,
  })
  const referenceRef = useMergeRefs([triggerRef, refs.setReference])
  const floatingRef = useMergeRefs([menuRef, refs.setFloating])
  const initialDueDate = task.dueDate ?? taskOccurrenceDate(task)
  const initialCalendarId = task.repeatRule?.calendarId
    ?? calendarSubscriptions.find(subscription => subscription.enabled)?.id
    ?? ''
  const [interval, setInterval] = useState(String(task.repeatRule?.interval ?? 1))
  const [unit, setUnit] = useState<DesktopTodoRepeatRule['unit']>(task.repeatRule?.unit ?? 'day')
  const [mode, setMode] = useState<DesktopTodoRepeatRule['mode']>(task.repeatRule?.mode ?? 'due')
  const [holidayPolicy, setHolidayPolicy] = useState<DesktopTodoRepeatRule['holidayPolicy']>(task.repeatRule?.holidayPolicy ?? 'allow')
  const [calendarId, setCalendarId] = useState(initialCalendarId)
  const [weekdays, setWeekdays] = useState<readonly number[]>(() => task.repeatRule?.weekdays?.length
    ? [...new Set(task.repeatRule.weekdays)].sort((left, right) => left - right)
    : [dayjs(initialDueDate).day()])
  const [dueDate, setDueDate] = useState(initialDueDate)
  const [text, setText] = useState(task.text)
  const [error, setError] = useState<string | null>(null)
  const [updating, setUpdating] = useState(false)
  const needsCalendar = unit === 'holiday' || holidayPolicy !== 'allow'
  const repeatRule: DesktopTodoRepeatRule = {
    ...(needsCalendar && calendarId.length > 0 ? { calendarId } : {}),
    ...(unit === 'holiday' ? {} : { holidayPolicy }),
    interval: Number(interval),
    mode,
    unit,
    ...(unit === 'week' ? { weekdays } : {}),
  }

  const update = async (input: Parameters<TodoTaskActionsProps['onUpdateTask']>[0]) => {
    setError(null)
    setUpdating(true)
    try {
      await onUpdateTask(input)
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
    if (needsCalendar && calendarId.length === 0) {
      setError(t('repeatCalendarError'))
      return
    }
    if (unit === 'week' && weekdays.length === 0) {
      setError(t('repeatWeekdayError'))
      return
    }
    void update({ blockId: task.blockId, dueDate, noteId: task.noteId, repeatRule, topicId: task.topicId })
  }
  const skip = () => {
    if (!task.repeatRule)
      return
    try {
      void update({
        blockId: task.blockId,
        dueDate: nextTodoOccurrenceDate(taskOccurrenceDate(task), task.repeatRule, calendarEvents),
        noteId: task.noteId,
        repeatRule: task.repeatRule,
        topicId: task.topicId,
      })
    }
    catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    }
  }
  const complete = () => {
    if (!task.repeatRule)
      return
    try {
      const completedOn = dayjs().format('YYYY-MM-DD')
      const baseDate = taskRepeatBaseDate(task, task.repeatRule, completedOn)
      void update({
        blockId: task.blockId,
        nextDueDate: nextTodoOccurrenceDate(baseDate, task.repeatRule, calendarEvents),
        noteId: task.noteId,
        status: 'done',
        topicId: task.topicId,
      })
    }
    catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    }
  }
  const onlyThis = () => {
    if (!task.repeatRule)
      return
    try {
      void update({
        blockId: task.blockId,
        dueDate,
        nextDueDate: nextTodoOccurrenceDate(taskOccurrenceDate(task), task.repeatRule, calendarEvents),
        noteId: task.noteId,
        onlyThis: true,
        text,
        topicId: task.topicId,
      })
    }
    catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    }
  }
  const toggleWeekday = (weekday: number) => {
    setWeekdays((current) => {
      if (!current.includes(weekday))
        return [...current, weekday].sort((left, right) => left - right)
      if (current.length === 1)
        return current
      return current.filter(item => item !== weekday)
    })
  }
  const missingSelectedCalendar = calendarId.length > 0
    && !calendarSubscriptions.some(subscription => subscription.id === calendarId)

  useEffect(() => {
    if (!open)
      return
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target
      if (!(target instanceof Node)
        || triggerRef.current?.contains(target)
        || menuRef.current?.contains(target)) {
        return
      }
      setOpen(false)
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape')
        return
      event.preventDefault()
      setOpen(false)
      triggerRef.current?.focus()
    }
    window.addEventListener('pointerdown', handlePointerDown, true)
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown, true)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  return (
    <div {...stylex.props(styles.shell)}>
      <button
        ref={referenceRef}
        {...stylex.props(styles.summary, compact && styles.summaryCompact)}
        aria-controls={menuId}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={t('taskActions')}
        title={t('taskActions')}
        type="button"
        onClick={() => setOpen(current => !current)}
      >
        <MoreHorizontal aria-hidden="true" size={15} strokeWidth={1.8} />
      </button>
      {open
        ? (
            <FloatingPortal>
              <div
                ref={floatingRef}
                {...stylex.props(styles.menu)}
                id={menuId}
                aria-labelledby={headingId}
                role="dialog"
                style={{
                  ...floatingStyles,
                  transformOrigin: floatingTransformOrigin(placement),
                  visibility: isPositioned ? 'visible' : 'hidden',
                }}
              >
                <strong id={headingId} {...stylex.props(styles.heading)}>{t('repeatSettings')}</strong>
                <label {...stylex.props(styles.field)}>
                  {t('repeatEvery')}
                  <input {...stylex.props(styles.input)} min={1} max={999} type="number" value={interval} onChange={event => setInterval(event.target.value)} />
                </label>
                <label {...stylex.props(styles.field)}>
                  {t('repeatUnit')}
                  <select {...stylex.props(styles.select)} value={unit} onChange={event => setUnit(event.target.value as DesktopTodoRepeatRule['unit'])}>
                    <option value="day">{t('repeatDay')}</option>
                    <option value="week">{t('repeatWeek')}</option>
                    <option value="month">{t('repeatMonth')}</option>
                    <option value="year">{t('repeatYear')}</option>
                    <option value="holiday">{t('repeatHoliday')}</option>
                  </select>
                </label>
                {unit === 'week' && (
                  <div {...stylex.props(styles.weekdayField)}>
                    <span {...stylex.props(styles.weekdayLabel)}>{t('repeatOn')}</span>
                    <div {...stylex.props(styles.weekdayControl)} aria-label={t('repeatOn')} role="group">
                      {weekdayOptions.map(weekday => (
                        <button
                          key={weekday.id}
                          {...stylex.props(styles.weekdayButton, weekdays.includes(weekday.id) && styles.weekdayButtonSelected)}
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
                )}
                <label {...stylex.props(styles.field)}>
                  {t('repeatMode')}
                  <select {...stylex.props(styles.select)} value={mode} onChange={event => setMode(event.target.value as DesktopTodoRepeatRule['mode'])}>
                    <option value="due">{t('repeatDue')}</option>
                    <option value="completion">{t('repeatCompletion')}</option>
                  </select>
                </label>
                {unit !== 'holiday' && (
                  <label {...stylex.props(styles.field)}>
                    {t('holidayPolicy')}
                    <select {...stylex.props(styles.select)} value={holidayPolicy} onChange={event => setHolidayPolicy(event.target.value as DesktopTodoRepeatRule['holidayPolicy'])}>
                      <option value="allow">{t('holidayAllow')}</option>
                      <option value="skip">{t('holidaySkip')}</option>
                      <option value="next-workday">{t('holidayNextWorkday')}</option>
                    </select>
                  </label>
                )}
                {needsCalendar && (
                  <label {...stylex.props(styles.field)}>
                    {t('repeatCalendar')}
                    <select {...stylex.props(styles.select, styles.selectWide)} value={calendarId} onChange={event => setCalendarId(event.target.value)}>
                      {calendarId.length === 0 && <option value="">{t('selectCalendar')}</option>}
                      {missingSelectedCalendar && <option value={calendarId}>{t('missingCalendar', { id: calendarId })}</option>}
                      {calendarSubscriptions.map(subscription => (
                        <option key={subscription.id} disabled={!subscription.enabled && subscription.id !== calendarId} value={subscription.id}>
                          {subscription.title}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <label {...stylex.props(styles.field)}>
                  {t('repeatStartDate')}
                  <input {...stylex.props(styles.input, styles.dateInput)} type="date" value={dueDate} onChange={event => setDueDate(event.target.value)} />
                </label>
                <button {...stylex.props(styles.action, styles.primaryAction)} disabled={updating} type="button" onClick={saveRepeat}>{t('saveRepeat')}</button>
                {task.repeatRule && (
                  <>
                    <div {...stylex.props(styles.divider)} />
                    <label {...stylex.props(styles.field)}>
                      {t('onlyThisText')}
                      <input {...stylex.props(styles.textInput)} value={text} onChange={event => setText(event.target.value)} />
                    </label>
                    <button {...stylex.props(styles.action)} disabled={updating} type="button" onClick={skip}>{t('skipThis')}</button>
                    <button {...stylex.props(styles.action)} disabled={updating} type="button" onClick={onlyThis}>{t('onlyThis')}</button>
                    <button {...stylex.props(styles.action, styles.primaryAction)} disabled={updating} type="button" onClick={complete}>{t('completeAndRepeat')}</button>
                  </>
                )}
                {error !== null && <span {...stylex.props(styles.error)} role="alert">{error}</span>}
              </div>
            </FloatingPortal>
          )
        : null}
    </div>
  )
}

export function TodoTaskActions(props: TodoTaskActionsProps) {
  return <TodoTaskActionsForm key={taskActionRevision(props.task, props.calendarSubscriptions)} {...props} />
}
