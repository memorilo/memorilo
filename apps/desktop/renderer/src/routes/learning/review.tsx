import { createFileRoute } from '@tanstack/react-router'
import { lazy, Suspense, useEffect } from 'react'

import { learningReviewRoute } from '../../features/learning/review/learning-review-route'
import { useDesktopConfiguration } from '../../shared/configuration'

const LearningReviewPage = lazy(async () => {
  const module = await import('../../features/learning/review/learning-review-page')
  return { default: module.LearningReviewPage }
})

export const Route = createFileRoute('/learning/review')({
  component: LearningReviewRoute,
  validateSearch: learningReviewRoute.validate,
})

function LearningReviewRoute() {
  const configuration = useDesktopConfiguration()
  const route = Route.useSearch()
  const navigate = Route.useNavigate()
  useEffect(() => {
    if (!configuration.learning.enabled)
      void navigate({ replace: true, to: '/journals' })
  }, [configuration.learning.enabled, navigate])
  if (!configuration.learning.enabled)
    return null
  return (
    <Suspense fallback={null}>
      <LearningReviewPage
        route={route}
        replaceRoute={next => navigate({ replace: true, search: next })}
      />
    </Suspense>
  )
}
