import type { DesktopTodoCalendarEvent, DesktopTodoCalendarSubscription, DesktopTodoTask, DesktopTodoTaskStatus, UpdateDesktopTodoTaskInput } from '@memorilo/desktop-api'
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
      <TodoTaskActions calendarEvents={calendarEvents} onUpdateTask={onUpdateTask} t={t} task={task} />
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

export function TodoCalendarView({
  calendarEvents,
  calendarSubscriptions,
  locale,
  now,
  onOpenTask,
  onUpdateTask,
  t,
  tasks,
  weekStart,
}: {
  calendarEvents: readonly DesktopTodoCalendarEvent[]
  calendarSubscriptions: readonly DesktopTodoCalendarSubscription[]
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
  const selectedTasks = grouped.get(selectedDate) ?? []
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
      <div {...stylex.props(styles.planningToolbar)}>
        <div {...stylex.props(styles.planningToolbarTitle)}>
          <span {...stylex.props(styles.planningTitle)}>{t('calendarView')}</span>
          <span {...stylex.props(styles.planningSubtitle)}>{t('calendarSubtitle')}</span>
        </div>
        <div {...stylex.props(styles.planningToolbarActions)}>
          <div {...stylex.props(styles.planningPeriodControl)}>
            {periodButton({ direction: 'previous', label: t('previousMonth'), onClick: () => selectMonth(previousMonth) })}
            <span {...stylex.props(styles.planningPeriodLabel)}>{formatMonth(activeMonth, locale)}</span>
            {periodButton({ direction: 'next', label: t('nextMonth'), onClick: () => selectMonth(nextMonth) })}
          </div>
          <button
            {...stylex.props(styles.planningTodayButton)}
            type="button"
            onClick={() => {
              setActiveMonth(today.startOf('month'))
              setSelectedDate(today.format('YYYY-MM-DD'))
            }}
          >
            {t('today')}
          </button>
        </div>
      </div>
      <div {...stylex.props(styles.calendarLayout)}>
        <section {...stylex.props(styles.calendarSurface)} aria-label={t('calendarView')}>
          <div {...stylex.props(styles.calendarRoot)}>
            <div {...stylex.props(styles.calendarWeekdays)} aria-hidden="true">
              {labels.map(item => <span key={item.key} {...stylex.props(styles.calendarWeekday)}>{item.label}</span>)}
            </div>
            <div role="grid" aria-label={formatMonth(activeMonth, locale)}>
              <div {...stylex.props(styles.calendarGrid)}>
                {days.map((date) => {
                  const dateKey = date.format('YYYY-MM-DD')
                  const dateTasks = grouped.get(dateKey) ?? []
                  const dateEvents = eventsByDate.get(dateKey) ?? []
                  const inMonth = date.isSame(activeMonth, 'month')
                  const isToday = dateKey === today.format('YYYY-MM-DD')
                  const isSelected = dateKey === selectedDate
                  return (
                    <button
                      key={dateKey}
                      {...stylex.props(
                        styles.calendarTile,
                        !inMonth && styles.calendarTileNeighbor,
                        isToday && styles.calendarTileToday,
                        isSelected && styles.calendarTileSelected,
                      )}
                      aria-label={t('calendarDay', { date: formatDate(date, locale), count: dateTasks.length + dateEvents.length })}
                      aria-selected={isSelected}
                      role="gridcell"
                      type="button"
                      onClick={() => chooseDate(date)}
                    >
                      <span {...stylex.props(styles.calendarDayNumber, isToday && styles.calendarDayNumberToday)}>{date.date()}</span>
                      <span {...stylex.props(styles.calendarTaskList)}>
                        {dateTasks.slice(0, 3).map(task => (
                          <span key={taskKey(task)} {...stylex.props(styles.calendarTaskPreview)}>{task.text}</span>
                        ))}
                        {dateEvents.slice(0, Math.max(0, 3 - dateTasks.length)).map(event => (
                          <span key={`${event.uid}:${event.startDate}`} {...stylex.props(styles.calendarEventPreview)}>{event.title}</span>
                        ))}
                        {dateTasks.length + dateEvents.length > 3 && <span {...stylex.props(styles.calendarTaskMore)}>{t('moreTasks', { count: dateTasks.length + dateEvents.length - 3 })}</span>}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
        </section>
        <aside {...stylex.props(styles.calendarDetails)} aria-label={t('selectedDay')}>
          <header {...stylex.props(styles.calendarDetailsHeader)}>
            <span {...stylex.props(styles.calendarDetailsTitle)}>{formatDate(dayjs(selectedDate), locale)}</span>
            <span {...stylex.props(styles.calendarDetailsCount)}>{t('calendarItemCount', { count: selectedTasks.length + (eventsByDate.get(selectedDate)?.length ?? 0) })}</span>
          </header>
          <div {...stylex.props(styles.calendarDetailsList)}>
            {selectedTasks.length === 0 && (eventsByDate.get(selectedDate)?.length ?? 0) === 0
              ? <div {...stylex.props(styles.planningEmpty)}>{t('noTasksOnDay')}</div>
              : (
                  <>
                    {selectedTasks.map(task => <PlanningTaskButton calendarEvents={calendarEvents} key={taskKey(task)} now={now} onOpenTask={onOpenTask} onUpdateTask={onUpdateTask} t={t} task={task} />)}
                    {(eventsByDate.get(selectedDate) ?? []).map(event => (
                      <div key={`${event.uid}:${event.startDate}`} {...stylex.props(styles.calendarEventDetail)}>
                        <span {...stylex.props(styles.calendarEventTitle)}>{event.title}</span>
                        <span {...stylex.props(styles.calendarEventSource)}>{event.subscriptionTitle}</span>
                      </div>
                    ))}
                  </>
                )}
          </div>
        </aside>
      </div>
      {calendarSubscriptions.length > 0 && (
        <div {...stylex.props(styles.calendarSubscriptions)} aria-label={t('calendarSubscriptions')}>
          {calendarSubscriptions.filter(subscription => subscription.enabled).map(subscription => <span key={subscription.id}>{subscription.title}</span>)}
        </div>
      )}
    </div>
  )
}

const quadrantDefinitions: readonly { id: TodoQuadrant, labelKey: string, signal: 'quiet' | 'strong' }[] = [
  { id: 'importantUrgent', labelKey: 'quadrantImportantUrgent', signal: 'strong' },
  { id: 'importantNotUrgent', labelKey: 'quadrantImportantNotUrgent', signal: 'strong' },
  { id: 'notImportantUrgent', labelKey: 'quadrantNotImportantUrgent', signal: 'quiet' },
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
                  <span {...stylex.props(styles.quadrantSignal, definition.signal === 'quiet' && styles.quadrantSignalQuiet)} aria-hidden="true" />
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
