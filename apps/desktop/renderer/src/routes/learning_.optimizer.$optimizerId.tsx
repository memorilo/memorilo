import { createFileRoute } from '@tanstack/react-router'

import { LearningOptimizerDetail } from '../features/learning/optimizer/learning-optimizer-detail'

export const Route = createFileRoute('/learning_/optimizer/$optimizerId')({
  component: LearningOptimizerRoute,
})

function LearningOptimizerRoute() {
  const { optimizerId } = Route.useParams()
  const navigate = Route.useNavigate()
  return (
    <LearningOptimizerDetail
      optimizerId={optimizerId}
      onDeleted={() => navigate({ search: { view: 'optimizer' }, to: '/learning' })}
    />
  )
}
