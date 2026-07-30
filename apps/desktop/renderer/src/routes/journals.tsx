import * as stylex from '@stylexjs/stylex'
import { createFileRoute } from '@tanstack/react-router'
import { lazy, Suspense } from 'react'

import { usePageTitlebar } from '../components/page-titlebar'
import { editorRouteStyles } from './-journals.stylex'

const JournalEditor = lazy(async () => {
  const module = await import('./-journal-editor')
  return { default: module.JournalEditor }
})

const journalsTitlebar = { title: 'Journals' } as const

function JournalLoadingState() {
  return (
    <main {...stylex.props(editorRouteStyles.statusPage)}>
      <p {...stylex.props(editorRouteStyles.statusMessage)} role="status">Loading editor…</p>
    </main>
  )
}

function JournalsRoute() {
  usePageTitlebar(journalsTitlebar)

  return (
    <Suspense fallback={<JournalLoadingState />}>
      <JournalEditor />
    </Suspense>
  )
}

export const Route = createFileRoute('/journals')({ component: JournalsRoute })
