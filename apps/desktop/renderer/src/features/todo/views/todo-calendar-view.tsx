import type { DesktopTodoCalendarEvent, DesktopTodoCalendarSubscription, DesktopTodoTask, UpdateDesktopTodoTaskInput } from '@memorilo/desktop-api'
import type { DesktopWeekStart } from '@memorilo/desktop-config'
import type { Dayjs } from 'dayjs'
import type { TFunction } from 'i18next'
import { previewTaskRecurrenceDates } from '@memorilo/editor/task'
import * as stylex from '@stylexjs/stylex'
import dayjs from 'dayjs'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useMemo, useState } from 'react'
import { taskPlanningDate, todoTaskKey } from '../todo-model'
import { TodoTaskActions } from '../todo-task-actions'
import { TodoTaskOccurrenceActions } from '../todo-task-occurrence-actions'
import { todoCalendarViewStyles as styles } from './todo-calendar-view.stylex'
import { todoPlanningViewStyles as planningStyles } from './todo-planning-view.stylex'

type CalendarItem
  = | { event: DesktopTodoCalendarEvent, kind: 'event' }
    | { date: string, kind: 'prediction', task: DesktopTodoTask }
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
  if (item.kind === 'task')
    return todoTaskKey(item.task)
  if (item.kind === 'prediction')
    return `${todoTaskKey(item.task)}:prediction:${item.date}`
  return `${item.event.subscriptionId}:${item.event.uid}:${item.event.startDate}`
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
  calendarSubscriptions,
  compactAlignment,
  onOpenTask,
  onUpdateTask,
  t,
  task,
}: {
  calendarEvents: readonly DesktopTodoCalendarEvent[]
  calendarSubscriptions: readonly DesktopTodoCalendarSubscription[]
  compactAlignment: 'left' | 'right'
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
        <TodoTaskOccurrenceActions
          calendarEvents={calendarEvents}
          onUpdateTask={onUpdateTask}
          t={t}
          task={task}
          triggerContent={(
            <span
              {...stylex.props(
                styles.taskStatus,
                task.status === 'doing' && styles.taskStatusDoing,
                task.status === 'done' && styles.taskStatusDone,
              )}
              aria-hidden="true"
            />
          )}
        />
        <span {...stylex.props(styles.taskText, task.status === 'done' && styles.taskTextDone)}>{task.text}</span>
      </button>
      <div {...stylex.props(styles.taskActions)}>
        <TodoTaskActions compact calendarEvents={calendarEvents} calendarSubscriptions={calendarSubscriptions} compactAlignment={compactAlignment} onUpdateTask={onUpdateTask} t={t} task={task} triggerContent={<span>{task.allDay ? t('allDay') : task.startAt?.slice(11) ?? task.dueTime ?? ''}</span>} />
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

function CalendarPredictionItem({ task, t }: { task: DesktopTodoTask, t: TFunction }) {
  return (
    <div {...stylex.props(styles.predictionShell)} title={t('repeatPrediction', { task: task.text })}>
      <div {...stylex.props(styles.predictionPreview)}>
        <span {...stylex.props(styles.predictionStatus)} aria-hidden="true" />
        <span {...stylex.props(styles.predictionText)}>{task.text}</span>
      </div>
    </div>
  )
}

function CalendarItemRow({
  calendarEvents,
  calendarSubscriptions,
  compactAlignment,
  item,
  onOpenTask,
  onUpdateTask,
  t,
}: {
  calendarEvents: readonly DesktopTodoCalendarEvent[]
  calendarSubscriptions: readonly DesktopTodoCalendarSubscription[]
  compactAlignment: 'left' | 'right'
  item: CalendarItem
  onOpenTask: (task: DesktopTodoTask) => Promise<void> | void
  onUpdateTask: (input: UpdateDesktopTodoTaskInput) => Promise<void>
  t: TFunction
}) {
  if (item.kind === 'event')
    return <CalendarEventItem event={item.event} />
  if (item.kind === 'prediction')
    return <CalendarPredictionItem t={t} task={item.task} />
  return <CalendarTaskItem calendarEvents={calendarEvents} calendarSubscriptions={calendarSubscriptions} compactAlignment={compactAlignment} onOpenTask={onOpenTask} onUpdateTask={onUpdateTask} t={t} task={item.task} />
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
  const days = useMemo(() => calendarDays(activeMonth, weekStart), [activeMonth, weekStart])
  const grouped = useMemo(() => {
    const result = new Map<string, CalendarItem[]>()
    const add = (date: string, item: CalendarItem) => {
      const current = result.get(date)
      if (current)
        current.push(item)
      else
        result.set(date, [item])
    }
    for (const task of tasks) {
      const date = taskPlanningDate(task)
      if (date !== null)
        add(date, { kind: 'task', task })
      if (!task.repeatRule || date === null)
        continue
      const previewDates = previewTaskRecurrenceDates(date, task.repeatRule, {
        calendarEvents,
        from: days[0]?.format('YYYY-MM-DD') ?? activeMonth.startOf('month').format('YYYY-MM-DD'),
        through: days.at(-1)?.format('YYYY-MM-DD') ?? activeMonth.endOf('month').format('YYYY-MM-DD'),
      })
      for (const previewDate of previewDates)
        add(previewDate, { date: previewDate, kind: 'prediction', task })
    }
    return result
  }, [activeMonth, calendarEvents, days, tasks])
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
              {days.map((date, dayIndex) => {
                const dateKey = date.format('YYYY-MM-DD')
                const dateItems = grouped.get(dateKey) ?? []
                const dateEvents = eventsByDate.get(dateKey) ?? []
                const items: readonly CalendarItem[] = [
                  ...dateItems,
                  ...dateEvents.map(event => ({ event, kind: 'event' as const })),
                ]
                const visibleItems = items.slice(0, 3)
                const inMonth = date.isSame(activeMonth, 'month')
                const isToday = dateKey === today.format('YYYY-MM-DD')
                const isSelected = dateKey === selectedDate
                const compactAlignment = dayIndex % 7 < 2 ? 'left' : 'right'
                return (
                  <div
                    key={dateKey}
                    {...stylex.props(styles.cell, !inMonth && styles.cellNeighbor)}
                    aria-label={t('calendarDay', { date: formatDate(date, locale), count: items.length })}
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
                          calendarSubscriptions={calendarSubscriptions}
                          compactAlignment={compactAlignment}
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
                                  calendarSubscriptions={calendarSubscriptions}
                                  compactAlignment={compactAlignment}
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
