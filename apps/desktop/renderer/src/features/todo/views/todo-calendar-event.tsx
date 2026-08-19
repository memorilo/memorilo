import type { DesktopTodoCalendarEvent } from '@memorilo/desktop-api'
import type { CSSProperties } from 'react'
import * as stylex from '@stylexjs/stylex'
import dayjs from 'dayjs'
import { todoCalendarColor } from '../../../shared/todo-calendar-color'
import { todoCalendarEventStyles as styles } from './todo-calendar-event.stylex'

function formatEventDate(event: DesktopTodoCalendarEvent, locale: string): string {
  const start = dayjs(event.startDate)
  const end = event.endDate ? dayjs(event.endDate) : null
  const formatter = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' })
  const startLabel = formatter.format(start.toDate())
  if (!end || end.isSame(start, 'day'))
    return startLabel
  return `${startLabel} - ${formatter.format(end.toDate())}`
}

export function TodoCalendarEventItem({
  event,
  locale,
  variant = 'strip',
}: {
  event: DesktopTodoCalendarEvent
  locale: string
  variant?: 'calendar' | 'strip' | 'timeline'
}) {
  const colorStyle = {
    '--todo-calendar-color': todoCalendarColor(event.subscriptionId),
  } as CSSProperties
  const isCalendar = variant === 'calendar'
  return (
    <div
      {...stylex.props(
        styles.item,
        variant === 'calendar' ? styles.calendarItem : variant === 'timeline' ? styles.timelineItem : styles.stripItem,
      )}
      style={colorStyle}
      title={`${event.title} - ${event.subscriptionTitle}`}
    >
      <span {...stylex.props(styles.accent, isCalendar && styles.calendarAccent)} aria-hidden="true" />
      <span {...stylex.props(styles.content, isCalendar && styles.calendarContent)}>
        <span {...stylex.props(styles.title, isCalendar && styles.calendarTitle)}>{event.title}</span>
        <span {...stylex.props(styles.source, isCalendar && styles.calendarSource)}>{event.subscriptionTitle}</span>
      </span>
      {!isCalendar && <span {...stylex.props(styles.date)}>{formatEventDate(event, locale)}</span>}
    </div>
  )
}

export function TodoCalendarEventStrip({
  events,
  locale,
  title,
}: {
  events: readonly DesktopTodoCalendarEvent[]
  locale: string
  title: string
}) {
  if (events.length === 0)
    return null
  const visible = [...events].sort((left, right) => (
    left.subscriptionTitle.localeCompare(right.subscriptionTitle)
    || left.title.localeCompare(right.title)
    || left.startDate.localeCompare(right.startDate)
  ))
  return (
    <section {...stylex.props(styles.strip)} aria-label={title}>
      <div {...stylex.props(styles.stripHeader)}>
        <span>{title}</span>
      </div>
      <div {...stylex.props(styles.stripList)}>
        {visible.map(event => <TodoCalendarEventItem event={event} key={`${event.subscriptionId}:${event.uid}:${event.startDate}`} locale={locale} />)}
      </div>
    </section>
  )
}
