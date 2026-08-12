import { createFileRoute } from '@tanstack/react-router'

import { validateJournalSearch } from '../features/journals/journal-model'
import { JournalsPage } from '../features/journals/journals-page'

export const Route = createFileRoute('/journals')({
  component: JournalsRoute,
  validateSearch: validateJournalSearch,
})

function JournalsRoute() {
  const { date } = Route.useSearch()
  return <JournalsPage requestedDate={date} />
}
