import { createFileRoute } from '@tanstack/react-router'

import { usePageTitlebar } from '../components/page-titlebar'

const journalsTitlebar = { title: 'Journals' } as const

export const Route = createFileRoute('/journals')({
  component: JournalsRoute,
})

function JournalsRoute() {
  usePageTitlebar(journalsTitlebar)
  return null
}
