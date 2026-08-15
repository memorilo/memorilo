import { createFileRoute } from '@tanstack/react-router'
import { lazy, Suspense, useEffect } from 'react'

import { useDesktopConfiguration } from '../shared/configuration'

const AnkiReviewPage = lazy(async () => {
  const module = await import('../features/learning/anki-review/anki-review-page')
  return { default: module.AnkiReviewPage }
})

interface AnkiReviewSearch {
  deckId: number
  deckName: string
}

function validateAnkiReviewSearch(search: Record<string, unknown>): AnkiReviewSearch {
  if (!Number.isSafeInteger(search.deckId) || Number(search.deckId) <= 0)
    throw new TypeError('Anki review requires a positive deck ID')
  if (typeof search.deckName !== 'string' || search.deckName.length === 0)
    throw new TypeError('Anki review requires a deck name')
  return { deckId: Number(search.deckId), deckName: search.deckName }
}

export const Route = createFileRoute('/learning_/anki-review')({
  component: AnkiReviewRoute,
  validateSearch: validateAnkiReviewSearch,
})

function AnkiReviewRoute() {
  const configuration = useDesktopConfiguration()
  const deck = Route.useSearch()
  const navigate = Route.useNavigate()
  useEffect(() => {
    if (!configuration.learning.enabled)
      void navigate({ replace: true, to: '/journals' })
  }, [configuration.learning.enabled, navigate])
  if (!configuration.learning.enabled)
    return null
  return (
    <Suspense fallback={null}>
      <AnkiReviewPage
        key={deck.deckId}
        deck={{ id: deck.deckId, name: deck.deckName }}
        onClose={() => navigate({ search: {}, to: '/learning' })}
      />
    </Suspense>
  )
}
