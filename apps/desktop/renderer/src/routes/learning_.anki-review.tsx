import { createFileRoute } from '@tanstack/react-router'

import { AnkiReviewPage } from '../features/learning/anki-review/anki-review-page'

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
  const deck = Route.useSearch()
  const navigate = Route.useNavigate()
  return (
    <AnkiReviewPage
      key={deck.deckId}
      deck={{ id: deck.deckId, name: deck.deckName }}
      onClose={() => navigate({ search: {}, to: '/learning' })}
    />
  )
}
