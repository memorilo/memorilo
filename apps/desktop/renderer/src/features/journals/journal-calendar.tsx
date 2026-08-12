import type { DesktopWeekStart } from '@memorilo/desktop-config'
import type { CalendarType, TileArgs } from 'react-calendar'
import * as stylex from '@stylexjs/stylex'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import Calendar from 'react-calendar'

import { journalCalendarStyles } from './journal-calendar.stylex'
import { fromJournalDate, toJournalDate } from './journal-model'

function calendarTypeForWeekStart(weekStart: DesktopWeekStart): CalendarType {
  return weekStart === 'sunday' ? 'gregory' : 'iso8601'
}

function weekdays(locale: string, weekStart: DesktopWeekStart): readonly { key: number, label: string }[] {
  const sunday = new Date(2026, 7, 2, 12)
  const firstDayOffset = weekStart === 'sunday' ? 0 : 1
  const formatter = new Intl.DateTimeFormat(locale, { weekday: 'narrow' })
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(sunday)
    date.setDate(sunday.getDate() + firstDayOffset + index)
    return { key: date.getDay(), label: formatter.format(date) }
  })
}

function sameMonth(left: Date, right: Date): boolean {
  return left.getFullYear() === right.getFullYear() && left.getMonth() === right.getMonth()
}

function isNextJournalMonthDisabled(activeMonth: Date, todayDate: Date): boolean {
  const nextMonth = new Date(activeMonth.getFullYear(), activeMonth.getMonth() + 1, 1, 12)
  return nextMonth.getFullYear() > todayDate.getFullYear()
    || (nextMonth.getFullYear() === todayDate.getFullYear() && nextMonth.getMonth() > todayDate.getMonth())
}

export function JournalCalendar({
  activeMonth,
  existingDates,
  locale,
  nextMonthLabel,
  onActiveMonthChange,
  onSelectDate,
  previousMonthLabel,
  selectedDate,
  today,
  weekStart,
}: {
  activeMonth: Date
  existingDates: ReadonlySet<string>
  locale: string
  nextMonthLabel: string
  onActiveMonthChange: (date: Date) => void
  onSelectDate: (journalDate: string) => void
  previousMonthLabel: string
  selectedDate: string
  today: string
  weekStart: DesktopWeekStart
}) {
  const calendarType = calendarTypeForWeekStart(weekStart)
  const weekdayLabels = weekdays(locale, weekStart)
  const todayDate = fromJournalDate(today)
  const selected = fromJournalDate(selectedDate)
  const previousMonth = new Date(activeMonth.getFullYear(), activeMonth.getMonth() - 1, 1, 12)
  const nextMonth = new Date(activeMonth.getFullYear(), activeMonth.getMonth() + 1, 1, 12)
  const nextMonthDisabled = isNextJournalMonthDisabled(activeMonth, todayDate)
  const monthLabel = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(activeMonth)

  const tileClassName = ({ date, view }: TileArgs): string | undefined => {
    if (view !== 'month')
      throw new Error(`Journal calendar cannot render ${view} tiles`)
    const journalDate = toJournalDate(date)
    return stylex.props(
      journalCalendarStyles.tile,
      !sameMonth(date, activeMonth) && journalCalendarStyles.tileHidden,
      journalDate > today && journalCalendarStyles.tileDisabled,
      journalDate === today && journalCalendarStyles.tileToday,
      journalDate === selectedDate && journalCalendarStyles.tileSelected,
    ).className
  }

  const tileContent = ({ date, view }: TileArgs) => {
    if (view !== 'month')
      throw new Error(`Journal calendar cannot render ${view} tile content`)
    const journalDate = toJournalDate(date)
    if (!sameMonth(date, activeMonth) || !existingDates.has(journalDate))
      return null
    return (
      <span
        {...stylex.props(
          journalCalendarStyles.presence,
          journalDate === selectedDate && journalCalendarStyles.presenceSelected,
        )}
        aria-hidden="true"
      />
    )
  }

  return (
    <div>
      <div {...stylex.props(journalCalendarStyles.navigation)}>
        <button
          {...stylex.props(journalCalendarStyles.navigationButton)}
          aria-label={previousMonthLabel}
          title={previousMonthLabel}
          type="button"
          onClick={() => onActiveMonthChange(previousMonth)}
        >
          <ChevronLeft aria-hidden="true" size={17} strokeWidth={1.9} />
        </button>
        <div {...stylex.props(journalCalendarStyles.monthLabel)} aria-live="polite">
          {monthLabel}
        </div>
        <button
          {...stylex.props(journalCalendarStyles.navigationButton)}
          aria-label={nextMonthLabel}
          disabled={nextMonthDisabled}
          title={nextMonthLabel}
          type="button"
          onClick={() => onActiveMonthChange(nextMonth)}
        >
          <ChevronRight aria-hidden="true" size={17} strokeWidth={1.9} />
        </button>
      </div>
      <div {...stylex.props(journalCalendarStyles.weekdays)} aria-hidden="true">
        {weekdayLabels.map(({ key, label }) => (
          <span key={key} {...stylex.props(journalCalendarStyles.weekday)}>{label}</span>
        ))}
      </div>
      <Calendar
        activeStartDate={activeMonth}
        calendarType={calendarType}
        className={stylex.props(journalCalendarStyles.calendar).className}
        formatDay={(_locale, date) => String(date.getDate())}
        formatShortWeekday={() => ''}
        locale={locale}
        maxDate={todayDate}
        maxDetail="month"
        minDetail="month"
        showFixedNumberOfWeeks
        showNavigation={false}
        showNeighboringMonth
        tileClassName={tileClassName}
        tileContent={tileContent}
        value={selected}
        onClickDay={date => onSelectDate(toJournalDate(date))}
      />
    </div>
  )
}
