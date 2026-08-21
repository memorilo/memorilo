import type { LearningSearch } from '../../features/learning/learning-page'
import { createFileRoute } from '@tanstack/react-router'
import { lazy, Suspense, useEffect } from 'react'

import { useDesktopConfiguration } from '../../shared/configuration'

const LearningPage = lazy(async () => {
  const module = await import('../../features/learning/learning-page')
  return { default: module.LearningPage }
})

function validateLearningSearch(search: Record<string, unknown>): LearningSearch {
  if (search.view === undefined)
    return {}
  if (search.view === 'notes' || search.view === 'optimizer')
    return { view: search.view }
  throw new TypeError('Learning view must be notes or optimizer')
}

export const Route = createFileRoute('/learning/')({
  component: LearningRoute,
  validateSearch: validateLearningSearch,
})

function LearningRoute() {
  const configuration = useDesktopConfiguration()
  const { view } = Route.useSearch()
  const navigate = Route.useNavigate()
  useEffect(() => {
    if (!configuration.learning.enabled)
      void navigate({ replace: true, to: '/journals' })
  }, [configuration.learning.enabled, navigate])
  if (!configuration.learning.enabled)
    return null
  return (
    <Suspense fallback={null}>
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
    </Suspense>
  )
}
