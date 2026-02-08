import { Button } from '@memorilo/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@memorilo/components/ui/popover'
import { createLazyFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import Calendar from 'react-calendar'
import { useTranslation } from 'react-i18next'
import { LuCalendarDays } from 'react-icons/lu'
import { JournalsList } from '~/components/journal/journals'
import { useJournals } from '~/hooks/use-journals'
import { useTitle } from '~/hooks/use-title'
import 'react-calendar/dist/Calendar.css'

export const Route = createLazyFileRoute('/journals')({
  component: Journals,
})

function Journals() {
  const { t, i18n } = useTranslation()
  useTitle(`${t('sidebar.journal')} - Memorilo`)

  const listState = useJournals()
  const { jumping, jumpToDate } = listState

  const [calendarOpen, setCalendarOpen] = useState(false)
  const [calendarValue, setCalendarValue] = useState<Date>(() => new Date())

  // Pick a day (create if missing) then scroll to it.
  function handlePickDay(value: Date) {
    setCalendarOpen(false)
    setCalendarValue(value)
    void jumpToDate(value)
  }

  return (
    <div className="flex h-svh flex-col overflow-hidden">
      <div className="px-2 py-1">
        <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              disabled={jumping}
              aria-label="Pick date"
            >
              <LuCalendarDays />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="p-0">
            <Calendar
              value={calendarValue}
              maxDate={new Date()}
              locale={i18n.language}
              onClickDay={handlePickDay}
            />
          </PopoverContent>
        </Popover>
      </div>

      <div className="min-h-0 flex-1">
        <JournalsList state={listState} />
      </div>
    </div>
  )
}
