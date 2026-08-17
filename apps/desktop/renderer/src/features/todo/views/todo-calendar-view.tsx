import type { DesktopTodoCalendarEvent, DesktopTodoTask, UpdateDesktopTodoTaskInput } from '@memorilo/desktop-api'
import type { DesktopWeekStart } from '@memorilo/desktop-config'
import type { Dayjs } from 'dayjs'
import type { TFunction } from 'i18next'
import * as stylex from '@stylexjs/stylex'
import dayjs from 'dayjs'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useMemo, useState } from 'react'
import { groupTodoTasksByDate, todoTaskKey } from '../todo-model'
import { TodoTaskActions } from '../todo-task-actions'
import { todoCalendarViewStyles as styles } from './todo-calendar-view.stylex'
import { todoPlanningViewStyles as planningStyles } from './todo-planning-view.stylex'

type CalendarItem
  = | { event: DesktopTodoCalendarEvent, kind: 'event' }
    | { kind: 'task', task: DesktopTodoTask }

function formatDate(date: Dayjs, locale: string): string {
  return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', weekday: 'short' }).format(date.toDate())
}

function formatMonth(date: Dayjs, locale: string): string {
  return new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(date.toDate())
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

function calendarItemKey(item: CalendarItem): string {
  return item.kind === 'task'
    ? todoTaskKey(item.task)
    : `${item.event.subscriptionId}:${item.event.uid}:${item.event.startDate}`
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
    <div {...stylex.props(styles.taskShell)}>
      <button
        {...stylex.props(styles.taskButton)}
        aria-label={t('openTask', { note: task.noteTitle, task: task.text })}
        title={t('openTask', { note: task.noteTitle, task: task.text })}
        type="button"
        onClick={() => void onOpenTask(task)}
      >
        <span
          {...stylex.props(
            styles.taskStatus,
            task.status === 'doing' && styles.taskStatusDoing,
            task.status === 'done' && styles.taskStatusDone,
          )}
          aria-hidden="true"
        />
        <span {...stylex.props(styles.taskText, task.status === 'done' && styles.taskTextDone)}>{task.text}</span>
      </button>
      <div {...stylex.props(styles.taskActions)}>
        <TodoTaskActions compact calendarEvents={calendarEvents} onUpdateTask={onUpdateTask} t={t} task={task} />
      </div>
    </div>
  )
}

function CalendarEventItem({ event }: { event: DesktopTodoCalendarEvent }) {
  return (
    <div
      {...stylex.props(styles.eventPreview)}
      title={`${event.title} - ${event.subscriptionTitle}`}
    >
      <span {...stylex.props(styles.eventAccent)} aria-hidden="true" />
      <span {...stylex.props(styles.eventText)}>{event.title}</span>
      <span {...stylex.props(styles.eventSource)}>{event.subscriptionTitle}</span>
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
    <div {...stylex.props(planningStyles.root)}>
      <div {...stylex.props(styles.toolbar)}>
        <h1 {...stylex.props(styles.monthTitle)}>{formatMonth(activeMonth, locale)}</h1>
        <div {...stylex.props(planningStyles.toolbarActions)}>
          <div {...stylex.props(styles.navigationControl)}>
            <PeriodButton direction="previous" label={t('previousMonth')} onClick={() => selectMonth(activeMonth.subtract(1, 'month'))} />
            <button
              {...stylex.props(styles.todayButton)}
              type="button"
              onClick={() => {
                setActiveMonth(today.startOf('month'))
                setSelectedDate(today.format('YYYY-MM-DD'))
              }}
            >
              {t('today')}
            </button>
            <PeriodButton direction="next" label={t('nextMonth')} onClick={() => selectMonth(activeMonth.add(1, 'month'))} />
          </div>
        </div>
      </div>
      <div {...stylex.props(styles.layout)}>
        <section {...stylex.props(styles.surface)} aria-label={t('calendarView')}>
          <div {...stylex.props(styles.root)}>
            <div {...stylex.props(styles.weekdays)} aria-hidden="true">
              {labels.map(item => <span key={item.key} {...stylex.props(styles.weekday)}>{item.label}</span>)}
            </div>
            <div {...stylex.props(styles.grid)} role="grid" aria-label={formatMonth(activeMonth, locale)}>
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
                    {...stylex.props(styles.cell, !inMonth && styles.cellNeighbor)}
                    aria-label={t('calendarDay', { date: formatDate(date, locale), count: dateTasks.length + dateEvents.length })}
                    aria-selected={isSelected}
                    role="gridcell"
                  >
                    <button
                      {...stylex.props(
                        styles.dayButton,
                        !inMonth && styles.dayButtonNeighbor,
                        isSelected && styles.dayButtonSelected,
                        isToday && styles.dayButtonToday,
                      )}
                      aria-label={formatDate(date, locale)}
                      type="button"
                      onClick={() => chooseDate(date)}
                    >
                      {date.date()}
                    </button>
                    <div {...stylex.props(styles.taskList)}>
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
                        <details {...stylex.props(styles.overflow)}>
                          <summary {...stylex.props(styles.taskMore)}>{t('moreTasks', { count: items.length - 3 })}</summary>
                          <div {...stylex.props(styles.overflowPopover)}>
                            <strong {...stylex.props(styles.overflowTitle)}>{formatDate(date, locale)}</strong>
                            <div {...stylex.props(styles.overflowList)}>
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
