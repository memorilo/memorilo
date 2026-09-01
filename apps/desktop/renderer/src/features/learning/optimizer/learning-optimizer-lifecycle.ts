import { desktopRequests } from '../../../shared/desktop-requests'
import { errorMessage } from '../../../shared/error-message'
import { useOwnedResource } from '../../../shared/lifecycle/owned-resource'

import { LearningOptimizerWorkflow } from './learning-optimizer-workflow'

export function optimizerErrorMessage(error: unknown): string {
  return errorMessage(error)
}

export function useLearningOptimizerWorkflow(): LearningOptimizerWorkflow | null {
  return useOwnedResource(
    'Learning optimizer workflow',
    desktopRequests.learning,
    learning => new LearningOptimizerWorkflow(learning),
  )
}
