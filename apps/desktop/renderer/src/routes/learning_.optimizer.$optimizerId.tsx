import { createFileRoute } from '@tanstack/react-router'

import { LearningOptimizerDetail } from './-learning-optimizer'

export const Route = createFileRoute('/learning_/optimizer/$optimizerId')({
  component: LearningOptimizerRoute,
})

function LearningOptimizerRoute() {
  const { optimizerId } = Route.useParams()
  return <LearningOptimizerDetail optimizerId={optimizerId} />
}
