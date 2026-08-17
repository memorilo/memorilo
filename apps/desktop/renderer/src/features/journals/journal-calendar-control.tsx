import type { DesktopWeekStart } from '@memorilo/desktop-config'
import type { RefObject } from 'react'
import * as stylex from '@stylexjs/stylex'
import { CalendarDays } from 'lucide-react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useEffect, useRef } from 'react'

import { JournalCalendar } from './journal-calendar'
import { journalCalendarControlStyles as journalRouteStyles } from './journal-calendar-control.stylex'

const popoverSpring = {
  bounce: 0,
  type: 'spring',
  visualDuration: 0.26,
} as const

const popoverExit = {
  duration: 0.16,
  ease: [0.4, 0, 1, 1],
} as const

function useDismissCalendarPopover({
  onClose,
  open,
  rootRef,
  triggerRef,
}: {
  onClose: () => void
  open: boolean
  rootRef: RefObject<HTMLDivElement | null>
  triggerRef: RefObject<HTMLButtonElement | null>
}) {
  useEffect(() => {
    if (!open)
      return
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target
      if (target instanceof Node && !rootRef.current?.contains(target))
        onClose()
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape')
        return
      event.preventDefault()
      onClose()
      triggerRef.current?.focus()
    }
    window.addEventListener('pointerdown', handlePointerDown, true)
    window.addEventListener('keydown', handleKeyDown, true)
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown, true)
      window.removeEventListener('keydown', handleKeyDown, true)
    }
  }, [onClose, open, rootRef, triggerRef])
}

export function JournalCalendarControl({
  activeMonth,
  calendarLabel,
  close,
  existingDates,
  loadingDates,
  locale,
  nextMonthLabel,
  onActiveMonthChange,
  onOpen,
  onSelectDate,
  open,
  previousMonthLabel,
  selectedDate,
  today,
  weekStart,
}: {
  activeMonth: Date
  calendarLabel: string
  close: () => void
  existingDates: ReadonlySet<string>
  loadingDates: boolean
  locale: string
  nextMonthLabel: string
  onActiveMonthChange: (date: Date) => void
  onOpen: () => void
  onSelectDate: (journalDate: string) => void
  open: boolean
  previousMonthLabel: string
  selectedDate: string
  today: string
  weekStart: DesktopWeekStart
}) {
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const shouldReduceMotion = useReducedMotion()
  useDismissCalendarPopover({ onClose: close, open, rootRef, triggerRef })

  return (
    <div ref={rootRef} {...stylex.props(journalRouteStyles.calendarRoot)}>
      <button
        ref={triggerRef}
        {...stylex.props(
          journalRouteStyles.calendarButton,
          open && journalRouteStyles.calendarButtonOpen,
        )}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={calendarLabel}
        data-window-no-drag=""
        title={calendarLabel}
        type="button"
        onClick={open ? close : onOpen}
      >
        <CalendarDays aria-hidden="true" size={17} strokeWidth={1.8} />
      </button>
      <AnimatePresence initial={false}>
        {open
          ? (
              <motion.section
                key="journal-calendar"
                {...stylex.props(
                  journalRouteStyles.calendarPopover,
                  loadingDates && journalRouteStyles.calendarLoading,
                )}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                aria-busy={loadingDates}
                aria-label={calendarLabel}
                exit={{
                  opacity: 0,
                  scale: shouldReduceMotion ? 1 : 0.965,
                  transition: shouldReduceMotion ? { duration: 0.12 } : popoverExit,
                  y: shouldReduceMotion ? 0 : -4,
                }}
                initial={{ opacity: 0, scale: shouldReduceMotion ? 1 : 0.965, y: shouldReduceMotion ? 0 : -4 }}
                role="dialog"
                transition={shouldReduceMotion ? { duration: 0.12 } : popoverSpring}
              >
                <span {...stylex.props(journalRouteStyles.calendarGlassHighlight)} aria-hidden="true" />
                <div {...stylex.props(journalRouteStyles.calendarContent)}>
                  <JournalCalendar
                    activeMonth={activeMonth}
                    existingDates={existingDates}
                    locale={locale}
                    nextMonthLabel={nextMonthLabel}
                    previousMonthLabel={previousMonthLabel}
                    selectedDate={selectedDate}
                    today={today}
                    weekStart={weekStart}
                    onActiveMonthChange={onActiveMonthChange}
                    onSelectDate={(journalDate) => {
                      close()
                      onSelectDate(journalDate)
                    }}
                  />
                </div>
              </motion.section>
            )
          : null}
      </AnimatePresence>
    </div>
  )
}
