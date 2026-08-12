import type { LearningSearch } from '../features/learning/learning-page'
import { createFileRoute } from '@tanstack/react-router'

import { LearningPage } from '../features/learning/learning-page'

function validateLearningSearch(search: Record<string, unknown>): LearningSearch {
  if (search.view === undefined)
    return {}
  if (search.view === 'notes' || search.view === 'optimizer')
    return { view: search.view }
  throw new TypeError('Learning view must be notes or optimizer')
}

export const Route = createFileRoute('/learning')({
  component: LearningRoute,
  validateSearch: validateLearningSearch,
})

function LearningRoute() {
  const { view } = Route.useSearch()
  const navigate = Route.useNavigate()
  return (
    <LearningPage
      view={view}
      onOpenOptimizer={optimizerId => navigate({
        params: { optimizerId },
        to: '/learning/optimizer/$optimizerId',
      })}
      onViewChange={nextView => navigate({
        replace: true,
        search: nextView === 'notes' ? {} : { view: nextView },
      })}
    />
  )
}
