import { desktopRequests } from '../../../shared/desktop-requests'
import { useOwnedResource } from '../../../shared/lifecycle/owned-resource'

import { LearningOptimizerWorkflow } from './learning-optimizer-workflow'

export function optimizerErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function useLearningOptimizerWorkflow(): LearningOptimizerWorkflow | null {
  return useOwnedResource(
    'Learning optimizer workflow',
    desktopRequests.learning,
    learning => new LearningOptimizerWorkflow(learning),
  )
}
