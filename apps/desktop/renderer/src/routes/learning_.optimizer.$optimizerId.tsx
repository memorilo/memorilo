import { createFileRoute } from '@tanstack/react-router'
import { lazy, Suspense, useEffect } from 'react'

import { useDesktopConfiguration } from '../shared/configuration'

const LearningOptimizerDetail = lazy(async () => {
  const module = await import('../features/learning/optimizer/learning-optimizer-detail')
  return { default: module.LearningOptimizerDetail }
})

export const Route = createFileRoute('/learning_/optimizer/$optimizerId')({
  component: LearningOptimizerRoute,
})

function LearningOptimizerRoute() {
  const configuration = useDesktopConfiguration()
  const { optimizerId } = Route.useParams()
  const navigate = Route.useNavigate()
  useEffect(() => {
    if (!configuration.learning.enabled)
      void navigate({ replace: true, to: '/journals' })
  }, [configuration.learning.enabled, navigate])
  if (!configuration.learning.enabled)
    return null
  return (
    <Suspense fallback={null}>
      <LearningOptimizerDetail
        optimizerId={optimizerId}
        onDeleted={() => navigate({ search: { view: 'optimizer' }, to: '/learning' })}
      />
    </Suspense>
  )
}
