import { createFileRoute } from '@tanstack/react-router'

import { LearningReviewPage } from '../features/learning/review/learning-review-page'
import { learningReviewRoute } from '../features/learning/review/learning-review-route'

export const Route = createFileRoute('/learning_/review')({
  component: LearningReviewRoute,
  validateSearch: learningReviewRoute.validate,
})

function LearningReviewRoute() {
  const route = Route.useSearch()
  const navigate = Route.useNavigate()
  return (
    <LearningReviewPage
      route={route}
      replaceRoute={next => navigate({ replace: true, search: next })}
    />
  )
}
