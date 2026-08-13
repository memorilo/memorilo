import type { ShelfSearch } from '../features/shelf/shelf-page'
import { createFileRoute } from '@tanstack/react-router'

import { ShelfPage } from '../features/shelf/shelf-page'

function validateShelfSearch(search: Record<string, unknown>): ShelfSearch {
  return {
    ...(typeof search.page === 'string' && search.page.length > 0 ? { page: search.page } : {}),
    ...(typeof search.q === 'string' && search.q.length > 0 ? { q: search.q } : {}),
    ...(typeof search.source === 'string' && search.source.length > 0 ? { source: search.source } : {}),
  }
}

export const Route = createFileRoute('/shelf')({
  component: ShelfRoute,
  validateSearch: validateShelfSearch,
})

function ShelfRoute() {
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  return (
    <ShelfPage
      search={search}
      pushSearch={next => navigate({ search: next })}
      replaceSearch={next => navigate({ replace: true, search: next })}
    />
  )
}
