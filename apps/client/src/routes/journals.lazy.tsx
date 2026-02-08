import { Button } from '@memorilo/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@memorilo/components/ui/popover'
import { createLazyFileRoute } from '@tanstack/react-router'
import { useCallback, useState } from 'react'
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

  const [isCalendarOpen, setIsCalendarOpen] = useState(false)
  const [selectedDate, setSelectedDate] = useState(() => new Date())

  // Pick a day (create if missing) then scroll to it.
  const handlePickDay = useCallback((value: Date) => {
    setIsCalendarOpen(false)
    setSelectedDate(value)
    void jumpToDate(value)
  }, [jumpToDate])

  return (
    <div className="size-full flex flex-col overflow-hidden">
      <div className="border-b px-2 py-1">
        <Popover open={isCalendarOpen} onOpenChange={setIsCalendarOpen}>
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
              value={selectedDate}
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
