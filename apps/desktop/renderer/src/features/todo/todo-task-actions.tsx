import type { DesktopTodoCalendarEvent, DesktopTodoRepeatRule, DesktopTodoTask } from '@memorilo/desktop-api'
import type { TFunction } from 'i18next'
import * as stylex from '@stylexjs/stylex'
import { MoreHorizontal } from 'lucide-react'
import { useMemo, useState } from 'react'
import { nextTodoOccurrenceDate, taskOccurrenceDate } from './todo-model'
import { todoTaskActionStyles as styles } from './todo-task-actions.stylex'

interface TodoTaskActionsProps {
  compact?: boolean
  calendarEvents: readonly DesktopTodoCalendarEvent[]
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

export function TodoTaskActions({ calendarEvents, compact = false, onUpdateTask, t, task }: TodoTaskActionsProps) {
  const [interval, setInterval] = useState(String(task.repeatRule?.interval ?? 1))
  const [unit, setUnit] = useState<DesktopTodoRepeatRule['unit']>(task.repeatRule?.unit ?? 'day')
  const [mode, setMode] = useState<DesktopTodoRepeatRule['mode']>(task.repeatRule?.mode ?? 'due')
  const [holidayPolicy, setHolidayPolicy] = useState<DesktopTodoRepeatRule['holidayPolicy']>(task.repeatRule?.holidayPolicy ?? 'allow')
  const [dueDate, setDueDate] = useState(() => task.dueDate ?? taskOccurrenceDate(task))
  const [text, setText] = useState(task.text)
  const [error, setError] = useState<string | null>(null)
  const holidayDates = useMemo(() => calendarEvents.map(event => event.startDate), [calendarEvents])
  const repeatRule: DesktopTodoRepeatRule = {
    ...(unit === 'holiday' ? { calendarId: calendarEvents[0]?.subscriptionId ?? 'cn-holidays' } : {}),
    holidayPolicy,
    interval: Number(interval),
    mode,
    unit,
  }

  const nextDate = () => nextTodoOccurrenceDate(dueDate, repeatRule, holidayDates)
  const update = async (input: Parameters<TodoTaskActionsProps['onUpdateTask']>[0]) => {
    setError(null)
    try {
      await onUpdateTask(input)
    }
    catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    }
  }
  const saveRepeat = () => {
    if (!Number.isSafeInteger(repeatRule.interval) || repeatRule.interval < 1 || repeatRule.interval > 999) {
      setError(t('repeatIntervalError'))
      return
    }
    void update({ blockId: task.blockId, dueDate, noteId: task.noteId, repeatRule, topicId: task.topicId })
  }
  const skip = () => {
    try {
      void update({ blockId: task.blockId, dueDate: nextDate(), noteId: task.noteId, repeatRule: task.repeatRule, topicId: task.topicId })
    }
    catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    }
  }
  const complete = () => {
    if (!task.repeatRule)
      return
    try {
      void update({ blockId: task.blockId, nextDueDate: nextTodoOccurrenceDate(taskOccurrenceDate(task), task.repeatRule, holidayDates), noteId: task.noteId, status: 'done', topicId: task.topicId })
    }
    catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    }
  }
  const onlyThis = () => {
    if (!task.repeatRule)
      return
    try {
      void update({ blockId: task.blockId, dueDate, nextDueDate: nextDate(), noteId: task.noteId, onlyThis: true, text, topicId: task.topicId })
    }
    catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause))
    }
  }

  return (
    <details {...stylex.props(styles.shell)}>
      <summary {...stylex.props(styles.summary, compact && styles.summaryCompact)} aria-label={t('taskActions')} title={t('taskActions')}>
        <MoreHorizontal aria-hidden="true" size={15} strokeWidth={1.8} />
      </summary>
      <div {...stylex.props(styles.menu, compact && styles.menuCompact)} role="menu">
        <strong {...stylex.props(styles.heading)}>{t('repeatSettings')}</strong>
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
        <label {...stylex.props(styles.field)}>
          {t('repeatMode')}
          <select {...stylex.props(styles.select)} value={mode} onChange={event => setMode(event.target.value as DesktopTodoRepeatRule['mode'])}>
            <option value="due">{t('repeatDue')}</option>
            <option value="completion">{t('repeatCompletion')}</option>
          </select>
        </label>
        {unit === 'holiday' && (
          <label {...stylex.props(styles.field)}>
            {t('holidayPolicy')}
            <select {...stylex.props(styles.select)} value={holidayPolicy} onChange={event => setHolidayPolicy(event.target.value as DesktopTodoRepeatRule['holidayPolicy'])}>
              <option value="allow">{t('holidayAllow')}</option>
              <option value="skip">{t('holidaySkip')}</option>
              <option value="next-workday">{t('holidayNextWorkday')}</option>
            </select>
          </label>
        )}
        <label {...stylex.props(styles.field)}>
          {t('repeatStartDate')}
          <input {...stylex.props(styles.input)} type="date" value={dueDate} onChange={event => setDueDate(event.target.value)} />
        </label>
        <button {...stylex.props(styles.action, styles.primaryAction)} type="button" onClick={saveRepeat}>{t('saveRepeat')}</button>
        {task.repeatRule && (
          <>
            <div {...stylex.props(styles.divider)} />
            <label {...stylex.props(styles.field)}>
              {t('onlyThisText')}
              <input {...stylex.props(styles.textInput)} value={text} onChange={event => setText(event.target.value)} />
            </label>
            <button {...stylex.props(styles.action)} type="button" onClick={skip}>{t('skipThis')}</button>
            <button {...stylex.props(styles.action)} type="button" onClick={onlyThis}>{t('onlyThis')}</button>
            <button {...stylex.props(styles.action, styles.primaryAction)} type="button" onClick={complete}>{t('completeAndRepeat')}</button>
          </>
        )}
        {error !== null && <span {...stylex.props(styles.error)} role="alert">{error}</span>}
      </div>
    </details>
  )
}
