import type { DesktopApi, RuntimeInfo } from '@memorilo/desktop-preload'
import { Effect, Layer } from 'effect'
import { createEffectQuery } from 'effect-query'

class RuntimeInfoError {
  readonly _tag = 'RuntimeInfoError'

  constructor(readonly cause: unknown) {}
}

const effectQuery = createEffectQuery(Layer.empty)

export function createRuntimeInfoQueryOptions(api: Pick<DesktopApi, 'getRuntimeInfo'>) {
  return effectQuery.queryOptions<RuntimeInfo, RuntimeInfoError, never>({
    queryKey: ['desktop', 'runtime-info'],
    queryFn: () => Effect.tryPromise({
      try: () => api.getRuntimeInfo(),
      catch: cause => new RuntimeInfoError(cause),
    }),
  })
}
