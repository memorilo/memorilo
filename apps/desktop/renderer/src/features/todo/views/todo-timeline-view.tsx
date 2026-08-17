import type { DesktopTodoCalendarEvent, DesktopTodoCalendarSubscription, DesktopTodoTask, UpdateDesktopTodoTaskInput } from '@memorilo/desktop-api'
import type { Dayjs } from 'dayjs'
import type { TFunction } from 'i18next'
import * as stylex from '@stylexjs/stylex'
import dayjs from 'dayjs'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useMemo, useState } from 'react'
import { groupTodoTasksByDate, taskPlanningDate, todoTaskKey } from '../todo-model'
import { TodoPlanningTask } from './todo-planning-task'
import { todoPlanningViewStyles as planningStyles } from './todo-planning-view.stylex'
import { todoTimelineViewStyles as styles } from './todo-timeline-view.stylex'

function formatTimelineDate(date: Dayjs, locale: string): string {
  return new Intl.DateTimeFormat(locale, { month: 'short', weekday: 'short' }).format(date.toDate())
}

function formatMonth(date: Dayjs, locale: string): string {
  return new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(date.toDate())
}

function PeriodButton({
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
      {...stylex.props(planningStyles.iconButton)}
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
  calendarSubscriptions,
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
  calendarSubscriptions: readonly DesktopTodoCalendarSubscription[]
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
    <section {...stylex.props(styles.group)}>
      <div {...stylex.props(styles.date)}>
        <span {...stylex.props(styles.dateNumber, isToday && styles.dateToday)}>{date.date()}</span>
        <span {...stylex.props(isToday && styles.dateToday)}>{formatTimelineDate(date, locale)}</span>
        <span {...stylex.props(styles.rail)} aria-hidden="true" />
        <span {...stylex.props(styles.dot, isToday && styles.dateToday)} aria-hidden="true" />
      </div>
      <div {...stylex.props(styles.items)}>
        {tasks.map(task => (
          <TodoPlanningTask
            calendarEvents={calendarEvents}
            calendarSubscriptions={calendarSubscriptions}
            key={todoTaskKey(task)}
            now={now}
            onOpenTask={onOpenTask}
            onUpdateTask={onUpdateTask}
            t={t}
            task={task}
          />
        ))}
      </div>
    </section>
  )
}

export function TodoTimelineView({
  calendarEvents,
  calendarSubscriptions,
  locale,
  now,
  onOpenTask,
  onUpdateTask,
  t,
  tasks,
}: {
  calendarEvents: readonly DesktopTodoCalendarEvent[]
  calendarSubscriptions: readonly DesktopTodoCalendarSubscription[]
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

  return (
    <div {...stylex.props(planningStyles.root)}>
      <div {...stylex.props(planningStyles.toolbar)}>
        <div {...stylex.props(planningStyles.toolbarTitle)}>
          <span {...stylex.props(planningStyles.title)}>{t('timelineView')}</span>
          <span {...stylex.props(planningStyles.subtitle)}>{t('timelineSubtitle')}</span>
        </div>
        <div {...stylex.props(planningStyles.toolbarActions)}>
          <div {...stylex.props(planningStyles.periodControl)}>
            <PeriodButton direction="previous" label={t('previousMonth')} onClick={() => setActiveMonth(current => current.subtract(1, 'month'))} />
            <span {...stylex.props(planningStyles.periodLabel)}>{formatMonth(activeMonth, locale)}</span>
            <PeriodButton direction="next" label={t('nextMonth')} onClick={() => setActiveMonth(current => current.add(1, 'month'))} />
          </div>
          <button {...stylex.props(planningStyles.todayButton)} type="button" onClick={() => setActiveMonth(today.startOf('month'))}>{t('today')}</button>
        </div>
      </div>
      <div {...stylex.props(styles.viewport)}>
        {monthGroups.map(([date, dateTasks]) => (
          <TimelineGroup
            calendarEvents={calendarEvents}
            calendarSubscriptions={calendarSubscriptions}
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
          <section {...stylex.props(styles.unscheduled)}>
            <div {...stylex.props(styles.unscheduledLabel)}>{t('unscheduled')}</div>
            <div {...stylex.props(styles.items)}>
              {unscheduled.map(task => (
                <TodoPlanningTask
                  calendarEvents={calendarEvents}
                  calendarSubscriptions={calendarSubscriptions}
                  key={todoTaskKey(task)}
                  now={now}
                  onOpenTask={onOpenTask}
                  onUpdateTask={onUpdateTask}
                  t={t}
                  task={task}
                />
              ))}
            </div>
          </section>
        )}
        {monthGroups.length === 0 && unscheduled.length === 0 && <div {...stylex.props(planningStyles.empty)}>{t('noTasksInPeriod')}</div>}
      </div>
    </div>
  )
}
