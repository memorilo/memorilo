import type { ShelfBookSearch } from '../../features/shelf/shelf-book-page'
import { createFileRoute } from '@tanstack/react-router'

import { ShelfBookPage } from '../../features/shelf/shelf-book-page'

function requiredSearchValue(search: Record<string, unknown>, name: keyof ShelfBookSearch): string {
  const value = search[name]
  if (typeof value !== 'string' || value.length === 0)
    throw new TypeError(`Shelf book details require a ${name} value`)
  return value
}

function validateShelfBookSearch(search: Record<string, unknown>): ShelfBookSearch {
  return {
    publication: requiredSearchValue(search, 'publication'),
    source: requiredSearchValue(search, 'source'),
  }
}

export const Route = createFileRoute('/shelf/book')({
  component: ShelfBookRoute,
  validateSearch: validateShelfBookSearch,
})

function ShelfBookRoute() {
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  return (
    <ShelfBookPage
      search={search}
      openReading={readingId => navigate({ params: { readingId }, to: '/reader/$readingId' })}
    />
  )
}
