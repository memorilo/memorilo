import type { DesktopTodoCalendarEvent, DesktopTodoTask, DesktopTodoTaskStatus, UpdateDesktopTodoTaskInput } from '@memorilo/desktop-api'
import type { DesktopWeekStart } from '@memorilo/desktop-config'
import type { Dayjs } from 'dayjs'
import type { TFunction } from 'i18next'
import type { TodoQuadrant } from './todo-model'
import * as stylex from '@stylexjs/stylex'
import dayjs from 'dayjs'
import {
  CalendarDays,
  ChartNoAxesGantt,
  ChevronLeft,
  ChevronRight,
  Circle,
  CircleCheck,
  CircleDotDashed,
  Grid2X2,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import {
  classifyTodoQuadrant,
  formatTaskDuration,
  groupTodoTasksByDate,
  taskElapsedMs,
  taskPlanningDate,

} from './todo-model'
import { todoPlanningStyles as styles } from './todo-planning-views.stylex'
import { TodoTaskActions } from './todo-task-actions'

function taskKey(task: DesktopTodoTask): string {
  return `${task.noteId}\0${task.topicId}\0${task.blockId}`
}

function TaskStatusIcon({ status }: { status: DesktopTodoTaskStatus }) {
  switch (status) {
    case 'todo':
      return <Circle {...stylex.props(styles.planningTaskIcon)} aria-hidden="true" strokeWidth={1.8} />
    case 'doing':
      return <CircleDotDashed {...stylex.props(styles.planningTaskIcon, styles.planningTaskDoing)} aria-hidden="true" strokeWidth={1.8} />
    case 'done':
      return <CircleCheck {...stylex.props(styles.planningTaskIcon, styles.planningTaskDoneIcon)} aria-hidden="true" strokeWidth={1.8} />
  }
}

function PlanningTaskButton({
  calendarEvents,
  now,
  onOpenTask,
  onUpdateTask,
  t,
  task,
}: {
  calendarEvents: readonly DesktopTodoCalendarEvent[]
  now: number
  onOpenTask: (task: DesktopTodoTask) => Promise<void> | void
  onUpdateTask: (input: UpdateDesktopTodoTaskInput) => Promise<void>
  t: TFunction
  task: DesktopTodoTask
}) {
  const elapsed = formatTaskDuration(taskElapsedMs(task, now))
  return (
    <div {...stylex.props(styles.planningTaskShell)}>
      <button
        {...stylex.props(styles.planningTask)}
        aria-label={t('openTask', { note: task.noteTitle, task: task.text })}
        title={t('openTask', { note: task.noteTitle, task: task.text })}
        type="button"
        onClick={() => void onOpenTask(task)}
      >
        <TaskStatusIcon status={task.status} />
        <span {...stylex.props(styles.planningTaskContent)}>
          <span {...stylex.props(styles.planningTaskTitle, task.status === 'done' && styles.planningTaskDone)}>{task.text}</span>
          <span {...stylex.props(styles.planningTaskMeta)}>{t('source', { note: task.noteTitle, topic: task.topicTitle })}</span>
        </span>
        <span {...stylex.props(styles.planningTaskElapsed)} title={t('elapsed', { duration: elapsed })}>{elapsed}</span>
      </button>
      <div {...stylex.props(styles.planningTaskActions)}>
        <TodoTaskActions calendarEvents={calendarEvents} onUpdateTask={onUpdateTask} t={t} task={task} />
      </div>
    </div>
  )
}

function formatDate(date: Dayjs, locale: string): string {
  return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', weekday: 'short' }).format(date.toDate())
}

function formatTimelineDate(date: Dayjs, locale: string): string {
  return new Intl.DateTimeFormat(locale, { month: 'short', weekday: 'short' }).format(date.toDate())
}

function formatMonth(date: Dayjs, locale: string): string {
  return new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(date.toDate())
}

function periodButton({
  direction,
  label,
  onClick,
}: {
  direction: 'next' | 'previous'
  label: string
  onClick: () => void
}) {
  return (
    <button
      {...stylex.props(styles.planningIconButton)}
      aria-label={label}
      title={label}
      type="button"
      onClick={onClick}
    >
      {direction === 'previous'
        ? <ChevronLeft aria-hidden="true" size={15} strokeWidth={1.9} />
        : <ChevronRight aria-hidden="true" size={15} strokeWidth={1.9} />}
    </button>
  )
}

function TimelineGroup({
  calendarEvents,
  date,
  isToday,
  locale,
  now,
  onOpenTask,
  onUpdateTask,
  t,
  tasks,
}: {
  calendarEvents: readonly DesktopTodoCalendarEvent[]
  date: Dayjs
  isToday: boolean
  locale: string
  now: number
  onOpenTask: (task: DesktopTodoTask) => Promise<void> | void
  onUpdateTask: (input: UpdateDesktopTodoTaskInput) => Promise<void>
  t: TFunction
  tasks: readonly DesktopTodoTask[]
}) {
  return (
    <section {...stylex.props(styles.timelineGroup)}>
      <div {...stylex.props(styles.timelineDate)}>
        <span {...stylex.props(styles.timelineDateNumber, isToday && styles.timelineDateToday)}>{date.date()}</span>
        <span {...stylex.props(isToday && styles.timelineDateToday)}>{formatTimelineDate(date, locale)}</span>
        <span {...stylex.props(styles.timelineRail)} aria-hidden="true" />
        <span {...stylex.props(styles.timelineDot, isToday && styles.timelineDateToday)} aria-hidden="true" />
      </div>
      <div {...stylex.props(styles.timelineItems)}>
        {tasks.map(task => <PlanningTaskButton calendarEvents={calendarEvents} key={taskKey(task)} now={now} onOpenTask={onOpenTask} onUpdateTask={onUpdateTask} t={t} task={task} />)}
      </div>
    </section>
  )
}

export function TodoTimelineView({
  calendarEvents,
  locale,
  now,
  onOpenTask,
  onUpdateTask,
  t,
  tasks,
}: {
  calendarEvents: readonly DesktopTodoCalendarEvent[]
  locale: string
  now: number
  onOpenTask: (task: DesktopTodoTask) => Promise<void> | void
  onUpdateTask: (input: UpdateDesktopTodoTaskInput) => Promise<void>
  t: TFunction
  tasks: readonly DesktopTodoTask[]
}) {
  const today = dayjs(now).startOf('day')
  const [activeMonth, setActiveMonth] = useState(() => today.startOf('month'))
  const grouped = useMemo(() => groupTodoTasksByDate(tasks), [tasks])
  const monthGroups = useMemo(() => [...grouped.entries()]
    .filter(([date]) => dayjs(date).isSame(activeMonth, 'month'))
    .sort(([left], [right]) => left.localeCompare(right)), [activeMonth, grouped])
  const unscheduled = useMemo(() => tasks.filter(task => taskPlanningDate(task) === null), [tasks])
  const previousMonth = activeMonth.subtract(1, 'month')
  const nextMonth = activeMonth.add(1, 'month')

  return (
    <div {...stylex.props(styles.planningRoot)}>
      <div {...stylex.props(styles.planningToolbar)}>
        <div {...stylex.props(styles.planningToolbarTitle)}>
          <span {...stylex.props(styles.planningTitle)}>{t('timelineView')}</span>
          <span {...stylex.props(styles.planningSubtitle)}>{t('timelineSubtitle')}</span>
        </div>
        <div {...stylex.props(styles.planningToolbarActions)}>
          <div {...stylex.props(styles.planningPeriodControl)}>
            {periodButton({ direction: 'previous', label: t('previousMonth'), onClick: () => setActiveMonth(previousMonth) })}
            <span {...stylex.props(styles.planningPeriodLabel)}>{formatMonth(activeMonth, locale)}</span>
            {periodButton({ direction: 'next', label: t('nextMonth'), onClick: () => setActiveMonth(nextMonth) })}
          </div>
          <button {...stylex.props(styles.planningTodayButton)} type="button" onClick={() => setActiveMonth(today.startOf('month'))}>{t('today')}</button>
        </div>
      </div>
      <div {...stylex.props(styles.timelineViewport)}>
        {monthGroups.map(([date, dateTasks]) => (
          <TimelineGroup
            calendarEvents={calendarEvents}
            key={date}
            date={dayjs(date)}
            isToday={date === today.format('YYYY-MM-DD')}
            locale={locale}
            now={now}
            onOpenTask={onOpenTask}
            onUpdateTask={onUpdateTask}
            t={t}
            tasks={dateTasks}
          />
        ))}
        {unscheduled.length > 0 && (
          <section {...stylex.props(styles.timelineUnscheduled)}>
            <div {...stylex.props(styles.timelineUnscheduledLabel)}>{t('unscheduled')}</div>
            <div {...stylex.props(styles.timelineItems)}>
              {unscheduled.map(task => <PlanningTaskButton calendarEvents={calendarEvents} key={taskKey(task)} now={now} onOpenTask={onOpenTask} onUpdateTask={onUpdateTask} t={t} task={task} />)}
            </div>
          </section>
        )}
        {monthGroups.length === 0 && unscheduled.length === 0 && <div {...stylex.props(styles.planningEmpty)}>{t('noTasksInPeriod')}</div>}
      </div>
    </div>
  )
}

function weekdayLabels(locale: string, weekStart: DesktopWeekStart): readonly { key: string, label: string }[] {
  const sunday = dayjs('2026-08-02')
  const offset = weekStart === 'monday' ? 1 : 0
  const formatter = new Intl.DateTimeFormat(locale, { weekday: 'short' })
  return Array.from({ length: 7 }, (_, index) => {
    const day = sunday.add(offset + index, 'day')
    return { key: day.format('dd'), label: formatter.format(day.toDate()) }
  })
}

function calendarDays(month: Dayjs, weekStart: DesktopWeekStart): readonly Dayjs[] {
  const first = month.startOf('month')
  const firstWeekday = weekStart === 'monday' ? (first.day() + 6) % 7 : first.day()
  const start = first.subtract(firstWeekday, 'day')
  return Array.from({ length: 42 }, (_, index) => start.add(index, 'day'))
}

type CalendarItem
  = | { event: DesktopTodoCalendarEvent, kind: 'event' }
    | { kind: 'task', task: DesktopTodoTask }

function calendarItemKey(item: CalendarItem): string {
  return item.kind === 'task'
    ? taskKey(item.task)
    : `${item.event.subscriptionId}:${item.event.uid}:${item.event.startDate}`
}

function CalendarTaskItem({
  calendarEvents,
  onOpenTask,
  onUpdateTask,
  t,
  task,
}: {
  calendarEvents: readonly DesktopTodoCalendarEvent[]
  onOpenTask: (task: DesktopTodoTask) => Promise<void> | void
  onUpdateTask: (input: UpdateDesktopTodoTaskInput) => Promise<void>
  t: TFunction
  task: DesktopTodoTask
}) {
  return (
    <div {...stylex.props(styles.calendarTaskShell)}>
      <button
        {...stylex.props(styles.calendarTaskButton)}
        aria-label={t('openTask', { note: task.noteTitle, task: task.text })}
        title={t('openTask', { note: task.noteTitle, task: task.text })}
        type="button"
        onClick={() => void onOpenTask(task)}
      >
        <span
          {...stylex.props(
            styles.calendarTaskStatus,
            task.status === 'doing' && styles.calendarTaskStatusDoing,
            task.status === 'done' && styles.calendarTaskStatusDone,
          )}
          aria-hidden="true"
        />
        <span {...stylex.props(styles.calendarTaskText, task.status === 'done' && styles.calendarTaskTextDone)}>{task.text}</span>
      </button>
      <div {...stylex.props(styles.calendarTaskActions)}>
        <TodoTaskActions compact calendarEvents={calendarEvents} onUpdateTask={onUpdateTask} t={t} task={task} />
      </div>
    </div>
  )
}

function CalendarEventItem({ event }: { event: DesktopTodoCalendarEvent }) {
  return (
    <div
      {...stylex.props(styles.calendarEventPreview)}
      title={`${event.title} - ${event.subscriptionTitle}`}
    >
      <span {...stylex.props(styles.calendarEventAccent)} aria-hidden="true" />
      <span {...stylex.props(styles.calendarEventText)}>{event.title}</span>
      <span {...stylex.props(styles.calendarEventSource)}>{event.subscriptionTitle}</span>
    </div>
  )
}

function CalendarItemRow({
  calendarEvents,
  item,
  onOpenTask,
  onUpdateTask,
  t,
}: {
  calendarEvents: readonly DesktopTodoCalendarEvent[]
  item: CalendarItem
  onOpenTask: (task: DesktopTodoTask) => Promise<void> | void
  onUpdateTask: (input: UpdateDesktopTodoTaskInput) => Promise<void>
  t: TFunction
}) {
  if (item.kind === 'event')
    return <CalendarEventItem event={item.event} />
  return <CalendarTaskItem calendarEvents={calendarEvents} onOpenTask={onOpenTask} onUpdateTask={onUpdateTask} t={t} task={item.task} />
}

export function TodoCalendarView({
  calendarEvents,
  locale,
  now,
  onOpenTask,
  onUpdateTask,
  t,
  tasks,
  weekStart,
}: {
  calendarEvents: readonly DesktopTodoCalendarEvent[]
  locale: string
  now: number
  onOpenTask: (task: DesktopTodoTask) => Promise<void> | void
  onUpdateTask: (input: UpdateDesktopTodoTaskInput) => Promise<void>
  t: TFunction
  tasks: readonly DesktopTodoTask[]
  weekStart: DesktopWeekStart
}) {
  const today = dayjs(now).startOf('day')
  const [activeMonth, setActiveMonth] = useState(() => today.startOf('month'))
  const [selectedDate, setSelectedDate] = useState(() => today.format('YYYY-MM-DD'))
  const grouped = useMemo(() => groupTodoTasksByDate(tasks), [tasks])
  const eventsByDate = useMemo(() => {
    const groupedEvents = new Map<string, DesktopTodoCalendarEvent[]>()
    for (const event of calendarEvents) {
      const current = groupedEvents.get(event.startDate)
      if (current)
        current.push(event)
      else
        groupedEvents.set(event.startDate, [event])
    }
    return groupedEvents
  }, [calendarEvents])
  const days = useMemo(() => calendarDays(activeMonth, weekStart), [activeMonth, weekStart])
  const previousMonth = activeMonth.subtract(1, 'month')
  const nextMonth = activeMonth.add(1, 'month')
  const labels = weekdayLabels(locale, weekStart)

  const selectMonth = (month: Dayjs) => {
    setActiveMonth(month)
    setSelectedDate(month.startOf('month').format('YYYY-MM-DD'))
  }

  const chooseDate = (date: Dayjs) => {
    setSelectedDate(date.format('YYYY-MM-DD'))
    if (!date.isSame(activeMonth, 'month'))
      setActiveMonth(date.startOf('month'))
  }

  return (
    <div {...stylex.props(styles.planningRoot)}>
      <div {...stylex.props(styles.calendarToolbar)}>
        <h1 {...stylex.props(styles.calendarMonthTitle)}>{formatMonth(activeMonth, locale)}</h1>
        <div {...stylex.props(styles.planningToolbarActions)}>
          <div {...stylex.props(styles.calendarNavigationControl)}>
            {periodButton({ direction: 'previous', label: t('previousMonth'), onClick: () => selectMonth(previousMonth) })}
            <button
              {...stylex.props(styles.calendarTodayButton)}
              type="button"
              onClick={() => {
                setActiveMonth(today.startOf('month'))
                setSelectedDate(today.format('YYYY-MM-DD'))
              }}
            >
              {t('today')}
            </button>
            {periodButton({ direction: 'next', label: t('nextMonth'), onClick: () => selectMonth(nextMonth) })}
          </div>
        </div>
      </div>
      <div {...stylex.props(styles.calendarLayout)}>
        <section {...stylex.props(styles.calendarSurface)} aria-label={t('calendarView')}>
          <div {...stylex.props(styles.calendarRoot)}>
            <div {...stylex.props(styles.calendarWeekdays)} aria-hidden="true">
              {labels.map(item => <span key={item.key} {...stylex.props(styles.calendarWeekday)}>{item.label}</span>)}
            </div>
            <div {...stylex.props(styles.calendarGrid)} role="grid" aria-label={formatMonth(activeMonth, locale)}>
              {days.map((date) => {
                const dateKey = date.format('YYYY-MM-DD')
                const dateTasks = grouped.get(dateKey) ?? []
                const dateEvents = eventsByDate.get(dateKey) ?? []
                const items: readonly CalendarItem[] = [
                  ...dateTasks.map(task => ({ kind: 'task' as const, task })),
                  ...dateEvents.map(event => ({ event, kind: 'event' as const })),
                ]
                const visibleItems = items.slice(0, 3)
                const inMonth = date.isSame(activeMonth, 'month')
                const isToday = dateKey === today.format('YYYY-MM-DD')
                const isSelected = dateKey === selectedDate
                return (
                  <div
                    key={dateKey}
                    {...stylex.props(
                      styles.calendarCell,
                      !inMonth && styles.calendarCellNeighbor,
                    )}
                    aria-label={t('calendarDay', { date: formatDate(date, locale), count: dateTasks.length + dateEvents.length })}
                    aria-selected={isSelected}
                    role="gridcell"
                  >
                    <button
                      {...stylex.props(
                        styles.calendarDayButton,
                        !inMonth && styles.calendarDayButtonNeighbor,
                        isSelected && styles.calendarDayButtonSelected,
                        isToday && styles.calendarDayButtonToday,
                      )}
                      aria-label={formatDate(date, locale)}
                      type="button"
                      onClick={() => chooseDate(date)}
                    >
                      {date.date()}
                    </button>
                    <div {...stylex.props(styles.calendarTaskList)}>
                      {visibleItems.map(item => (
                        <CalendarItemRow
                          calendarEvents={calendarEvents}
                          item={item}
                          key={calendarItemKey(item)}
                          onOpenTask={onOpenTask}
                          onUpdateTask={onUpdateTask}
                          t={t}
                        />
                      ))}
                      {items.length > 3 && (
                        <details {...stylex.props(styles.calendarOverflow)}>
                          <summary {...stylex.props(styles.calendarTaskMore)}>{t('moreTasks', { count: items.length - 3 })}</summary>
                          <div {...stylex.props(styles.calendarOverflowPopover)}>
                            <strong {...stylex.props(styles.calendarOverflowTitle)}>{formatDate(date, locale)}</strong>
                            <div {...stylex.props(styles.calendarOverflowList)}>
                              {items.map(item => (
                                <CalendarItemRow
                                  calendarEvents={calendarEvents}
                                  item={item}
                                  key={calendarItemKey(item)}
                                  onOpenTask={onOpenTask}
                                  onUpdateTask={onUpdateTask}
                                  t={t}
                                />
                              ))}
                            </div>
                          </div>
                        </details>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}

const quadrantDefinitions: readonly { id: TodoQuadrant, labelKey: string, signal: 'critical' | 'important' | 'quiet' | 'urgent' }[] = [
  { id: 'importantUrgent', labelKey: 'quadrantImportantUrgent', signal: 'critical' },
  { id: 'importantNotUrgent', labelKey: 'quadrantImportantNotUrgent', signal: 'important' },
  { id: 'notImportantUrgent', labelKey: 'quadrantNotImportantUrgent', signal: 'urgent' },
  { id: 'notImportantNotUrgent', labelKey: 'quadrantNotImportantNotUrgent', signal: 'quiet' },
]

export function TodoQuadrantView({
  calendarEvents,
  now,
  onOpenTask,
  onUpdateTask,
  t,
  tasks,
}: {
  calendarEvents: readonly DesktopTodoCalendarEvent[]
  now: number
  onOpenTask: (task: DesktopTodoTask) => Promise<void> | void
  onUpdateTask: (input: UpdateDesktopTodoTaskInput) => Promise<void>
  t: TFunction
  tasks: readonly DesktopTodoTask[]
}) {
  const today = dayjs(now).format('YYYY-MM-DD')
  const grouped = useMemo(() => {
    const result: Record<TodoQuadrant, DesktopTodoTask[]> = {
      importantNotUrgent: [],
      importantUrgent: [],
      notImportantNotUrgent: [],
      notImportantUrgent: [],
    }
    for (const task of tasks)
      result[classifyTodoQuadrant(task, today)].push(task)
    return result
  }, [tasks, today])

  return (
    <div {...stylex.props(styles.planningRoot)}>
      <div {...stylex.props(styles.planningToolbar)}>
        <div {...stylex.props(styles.planningToolbarTitle)}>
          <span {...stylex.props(styles.planningTitle)}>{t('quadrantView')}</span>
          <span {...stylex.props(styles.planningSubtitle)}>{t('quadrantSubtitle')}</span>
        </div>
        <span {...stylex.props(styles.quadrantRule)}>{t('quadrantRule')}</span>
      </div>
      <div {...stylex.props(styles.quadrantGrid)}>
        {quadrantDefinitions.map((definition) => {
          const quadrantTasks = grouped[definition.id]
          return (
            <section key={definition.id} {...stylex.props(styles.quadrantPanel)} aria-label={t(definition.labelKey)}>
              <header {...stylex.props(styles.quadrantHeader)}>
                <span {...stylex.props(styles.quadrantTitle)}>
                  <span
                    {...stylex.props(
                      styles.quadrantSignal,
                      definition.signal === 'important' && styles.quadrantSignalImportant,
                      definition.signal === 'urgent' && styles.quadrantSignalUrgent,
                      definition.signal === 'quiet' && styles.quadrantSignalQuiet,
                    )}
                    aria-hidden="true"
                  />
                  {t(definition.labelKey)}
                </span>
                <span {...stylex.props(styles.quadrantCount)}>{quadrantTasks.length}</span>
              </header>
              <div {...stylex.props(styles.quadrantBody)}>
                {quadrantTasks.length === 0
                  ? <div {...stylex.props(styles.quadrantEmpty)}>{t('noTasksInQuadrant')}</div>
                  : quadrantTasks.map(task => <PlanningTaskButton calendarEvents={calendarEvents} key={taskKey(task)} now={now} onOpenTask={onOpenTask} onUpdateTask={onUpdateTask} t={t} task={task} />)}
              </div>
            </section>
          )
        })}
      </div>
    </div>
  )
}

export function PlanningViewIcon({ view }: { view: 'timeline' | 'calendar' | 'quadrant' }) {
  if (view === 'timeline')
    return <ChartNoAxesGantt aria-hidden="true" size={14} strokeWidth={1.8} />
  if (view === 'calendar')
    return <CalendarDays aria-hidden="true" size={14} strokeWidth={1.8} />
  return <Grid2X2 aria-hidden="true" size={14} strokeWidth={1.8} />
}
