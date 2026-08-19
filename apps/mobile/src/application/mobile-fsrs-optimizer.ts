import type {
  FsrsOptimizerConfiguration,
  RatingHistory,
} from '@memorilo/srs/portable'

export interface MobileFsrsOptimizerRequest {
  configuration: FsrsOptimizerConfiguration
  histories: readonly RatingHistory[]
  timeoutMilliseconds?: number
}

export type MobileFsrsOptimizerHandler = (
  request: MobileFsrsOptimizerRequest,
) => Promise<FsrsOptimizerConfiguration>

let handler: MobileFsrsOptimizerHandler | null = null

export function registerMobileFsrsOptimizer(next: MobileFsrsOptimizerHandler): () => void {
  handler = next
  return () => {
    if (handler === next)
      handler = null
  }
}

export function optimizeMobileFsrsParameters(
  histories: readonly RatingHistory[],
  configuration: FsrsOptimizerConfiguration,
  timeoutMilliseconds?: number,
): Promise<FsrsOptimizerConfiguration> {
  if (!handler)
    return Promise.reject(new Error('FSRS parameter optimization surface is unavailable'))
  return handler({ configuration, histories, ...(timeoutMilliseconds === undefined ? {} : { timeoutMilliseconds }) })
}
