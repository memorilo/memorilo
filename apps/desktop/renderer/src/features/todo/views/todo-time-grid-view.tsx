import type { DateSelectArg, EventChangeArg, EventClickArg } from '@fullcalendar/core'
import type { CreateDesktopTodoTaskInput, DesktopTodoCalendarEvent, DesktopTodoTask, UpdateDesktopTodoTaskInput } from '@memorilo/desktop-api'
import type { DesktopTodoConfiguration } from '@memorilo/desktop-config'
import interactionPlugin from '@fullcalendar/interaction'
import FullCalendar from '@fullcalendar/react'
import timeGridPlugin from '@fullcalendar/timegrid'
import * as stylex from '@stylexjs/stylex'
import dayjs from 'dayjs'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

const storageKeys = {
  multiDay: 'memorilo.todo.timeline.multiDay',
  multiWeek: 'memorilo.todo.timeline.multiWeek',
} as const

const styles = stylex.create({
  root: { display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 },
  toolbar: { alignItems: 'center', display: 'flex', justifyContent: 'space-between', padding: '8px 12px' },
  controls: { alignItems: 'center', display: 'flex', gap: 4 },
  control: { backgroundColor: 'transparent', border: '1px solid transparent', borderRadius: 5, color: 'var(--text-secondary)', padding: '4px 8px' },
  active: { backgroundColor: 'var(--surface-secondary)', borderColor: 'var(--border-subtle)', color: 'var(--text-primary)' },
  navigation: { display: 'flex', gap: 2 },
  calendar: { flex: 1, minHeight: 0, padding: '0 12px 12px' },
})

function remembered(key: string, fallback: number, min: number, max: number): number {
  if (typeof window === 'undefined')
    return fallback
  const value = Number(window.localStorage.getItem(key))
  return Number.isInteger(value) && value >= min && value <= max ? value : fallback
}

function taskStart(task: DesktopTodoTask): string | null {
  if (task.startAt)
    return task.startAt
  if (task.dueDate && task.dueTime)
    return `${task.dueDate}T${task.dueTime}:00`
  return task.dueDate
}

function taskEnd(task: DesktopTodoTask): string | null {
  return task.endAt ?? null
}

function dateFromEvent(event: { id: string, start: Date | null, end: Date | null, allDay: boolean }): UpdateDesktopTodoTaskInput | null {
  if (event.start === null)
    return null
  const start = dayjs(event.start)
  const end = event.end === null ? null : dayjs(event.end)
  return {
    allDay: event.allDay,
    blockId: event.id,
    dueDate: start.format('YYYY-MM-DD'),
    dueTime: event.allDay ? null : start.format('HH:mm'),
    endAt: event.allDay || end === null ? null : end.format('YYYY-MM-DDTHH:mm:ss'),
    noteId: '',
    startAt: event.allDay ? null : start.format('YYYY-MM-DDTHH:mm:ss'),
    text: undefined,
    topicId: '',
  }
}

export function TodoTimeGridView({
  calendarEvents,
  now,
  onCreateTask,
  onSelectTask,
  onUpdateTask,
  settings,
  tasks,
  weekStart,
}: {
  calendarEvents: readonly DesktopTodoCalendarEvent[]
  locale: string
  now: number
  onCreateTask: (input: CreateDesktopTodoTaskInput) => Promise<DesktopTodoTask>
  onSelectTask: (task: DesktopTodoTask) => Promise<void> | void
  onUpdateTask: (input: UpdateDesktopTodoTaskInput) => Promise<void>
  settings: DesktopTodoConfiguration
  tasks: readonly DesktopTodoTask[]
  weekStart: 'monday' | 'sunday'
}) {
  const { t } = useTranslation('todo')
  const [mode, setMode] = useState<'day' | 'multi-day' | 'week' | 'multi-week'>('day')
  const [multiDay, setMultiDay] = useState(() => remembered(storageKeys.multiDay, 3, 1, 7))
  const [multiWeek, setMultiWeek] = useState(() => remembered(storageKeys.multiWeek, 2, 1, 4))
  const [anchor, setAnchor] = useState(() => dayjs(now).startOf('day').toDate())
  const days = mode === 'day' ? 1 : mode === 'multi-day' ? multiDay : mode === 'week' ? 7 : multiWeek * 7
  const calendarEventsForView = useMemo(() => tasks.map((task) => {
    const start = taskStart(task)
    if (!start)
      return null
    return {
      allDay: task.allDay || !task.startAt,
      backgroundColor: task.status === 'done' ? 'var(--todo-done)' : 'var(--todo-task)',
      borderColor: 'transparent',
      extendedProps: { task },
      id: task.blockId,
      end: taskEnd(task) ?? undefined,
      start,
      title: task.text,
    }
  }).filter((event): event is NonNullable<typeof event> => event !== null), [tasks])
  const externalEvents = calendarEvents.map(event => ({
    allDay: event.allDay ?? !event.startAt,
    backgroundColor: 'var(--todo-calendar)',
    borderColor: 'transparent',
    id: `calendar:${event.subscriptionId}:${event.uid}:${event.startDate}`,
    start: event.startAt ?? event.startDate,
    end: event.endAt ?? (event.endDate ? dayjs(event.endDate).add(1, 'day').format('YYYY-MM-DD') : undefined),
    title: event.title,
  }))
  const changeSpan = (next: number) => {
    if (mode === 'multi-day') {
      setMultiDay(next)
      window.localStorage.setItem(storageKeys.multiDay, String(next))
    }
    else {
      setMultiWeek(next)
      window.localStorage.setItem(storageKeys.multiWeek, String(next))
    }
  }
  const handleSelect = async (info: DateSelectArg) => {
    const start = dayjs(info.start)
    const duration = settings.blankTaskDurationMinutes
    const end = duration > 0 ? start.add(duration, 'minute') : null
    await onCreateTask({
      allDay: info.allDay,
      dueDate: start.format('YYYY-MM-DD'),
      dueTime: info.allDay ? null : start.format('HH:mm'),
      endAt: end?.format('YYYY-MM-DDTHH:mm:ss') ?? null,
      startAt: info.allDay ? null : start.format('YYYY-MM-DDTHH:mm:ss'),
      text: '',
    })
  }
  const handleEventChange = async (info: EventChangeArg) => {
    const task = info.event.extendedProps.task as DesktopTodoTask | undefined
    if (!task)
      return
    const input = dateFromEvent(info.event)
    if (!input)
      return
    await onUpdateTask({ ...input, blockId: task.blockId, noteId: task.noteId, topicId: task.topicId, text: task.text })
  }
  const handleEventClick = (info: EventClickArg) => {
    const task = info.event.extendedProps.task as DesktopTodoTask | undefined
    if (task)
      void onSelectTask(task)
  }
  const viewType = mode === 'day' ? 'timeGridDay' : 'timeGridWeek'
  const header = `${t(mode === 'multi-day' ? 'multiDayView' : mode === 'multi-week' ? 'multiWeekView' : mode === 'week' ? 'weekView' : 'dayView')}`
  return (
    <div {...stylex.props(styles.root)}>
      <div {...stylex.props(styles.toolbar)}>
        <div {...stylex.props(styles.controls)} role="group" aria-label={t('timelineRange')}>
          {(['day', 'multi-day', 'week', 'multi-week'] as const).map(value => (
            <button key={value} type="button" aria-pressed={mode === value} {...stylex.props(styles.control, mode === value && styles.active)} onClick={() => setMode(value)}>
              {t(value === 'multi-day' ? 'multiDayView' : value === 'multi-week' ? 'multiWeekView' : value === 'week' ? 'weekView' : 'dayView')}
            </button>
          ))}
          {(mode === 'multi-day' || mode === 'multi-week') && (
            <select aria-label={header} value={mode === 'multi-day' ? multiDay : multiWeek} onChange={event => changeSpan(Number(event.target.value))}>
              {Array.from({ length: mode === 'multi-day' ? 7 : 4 }, (_, index) => index + 1).map(value => <option key={value} value={value}>{value}</option>)}
            </select>
          )}
        </div>
        <div {...stylex.props(styles.navigation)}>
          <button type="button" aria-label={t('previousPeriod')} onClick={() => setAnchor(current => dayjs(current).subtract(days, 'day').toDate())}><ChevronLeft size={15} /></button>
          <button type="button" aria-label={t('nextPeriod')} onClick={() => setAnchor(current => dayjs(current).add(days, 'day').toDate())}><ChevronRight size={15} /></button>
        </div>
      </div>
      <div {...stylex.props(styles.calendar)}>
        <FullCalendar
          key={`${mode}:${days}:${anchor.toISOString()}`}
          allDaySlot
          allDayText={t('allDay')}
          editable
          firstDay={weekStart === 'monday' ? 1 : 0}
          height="100%"
          initialDate={anchor}
          initialView={viewType}
          nowIndicator
          plugins={[timeGridPlugin, interactionPlugin]}
          scrollTime={`${String(settings.timelineWorkdayStartHour).padStart(2, '0')}:00:00`}
          select={handleSelect}
          selectable
          slotMaxTime="24:00:00"
          slotMinTime="00:00:00"
          eventClick={handleEventClick}
          eventChange={handleEventChange}
          events={[...calendarEventsForView, ...externalEvents]}
          views={{ timeGridWeek: { duration: { days } } }}
        />
      </div>
    </div>
  )
}
