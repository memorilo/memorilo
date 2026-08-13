import type { LatestOperationResult, SingleFlightResult } from '@memorilo/effect-lifecycle'
import {
  createLatestOperationSupervisor,
  createOperationSupervisor,
  createResourceScope,
} from '@memorilo/effect-lifecycle'

type LatestReviewResult<Value> = LatestOperationResult<Value>

type ReviewActionResult<Value>
  = | SingleFlightResult<Value>
    | { status: 'superseded' }

/** Owns concurrency, cancellation, and lifetime for one review workflow. */
export function createLearningReviewSession() {
  const actions = createOperationSupervisor('Learning review action')
  const latest = createLatestOperationSupervisor<'action' | 'preparation' | 'route'>(
    'Learning review session operation',
    { concurrency: 'parallel' },
  )

  const resources = createResourceScope('Learning review session')
  resources.own({ close: latest.close, name: 'latest review operations' })
  resources.own({ close: actions.close, name: 'review actions' })
  resources.commit()

  const latestRead = <Value>(
    channel: 'preparation' | 'route',
    operation: (signal: AbortSignal) => Promise<Value>,
  ): Promise<LatestReviewResult<Value>> => {
    if (resources.isClosed())
      return Promise.reject(new Error('Learning review session is not active'))
    return latest.run(channel, ({ signal }) => operation(signal))
  }

  const action = async <Value>(
    operation: (signal: AbortSignal) => Promise<Value>,
  ): Promise<ReviewActionResult<Value>> => {
    if (resources.isClosed())
      throw new Error('Learning review session is not active')
    const result = await latest.run('action', ({ signal: latestSignal }) => {
      return actions.runSingleFlight(actionSignal => operation(AbortSignal.any([
        latestSignal,
        actionSignal,
      ])))
    })
    return result.status === 'current' ? result.value : result
  }

  return {
    action,
    close: resources.close,
    invalidateAction: () => latest.invalidate('action'),
    invalidatePreparation: () => latest.invalidate('preparation'),
    isActive: () => !resources.isClosed(),
    prepare: <Value>(operation: (signal: AbortSignal) => Promise<Value>) => (
      latestRead('preparation', operation)
    ),
    route: <Value>(operation: (signal: AbortSignal) => Promise<Value>) => (
      latestRead('route', operation)
    ),
  }
}
