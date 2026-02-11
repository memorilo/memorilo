import type * as ManagedRuntime from 'effect/ManagedRuntime'
import { useQuery } from '@tanstack/react-query'
import { Console, Duration, Effect } from 'effect'
import { createEffectQueryFromManagedRuntime } from 'effect-query'
import { isEmpty } from 'es-toolkit/compat'
import { AssetsService } from './command'

let cachedEq: ReturnType<typeof createEffectQueryFromManagedRuntime> | null = null

export function initEq(runtime: ManagedRuntime.ManagedRuntime<any, never>) {
  cachedEq = createEffectQueryFromManagedRuntime(runtime)
}

export function getEq() {
  if (!cachedEq) {
    throw new Error('Effect-query runtime is not initialized. Call setManagedRuntime() first.')
  }
  return cachedEq
}

export function useAssetUrl(assetId: string | null | undefined, useHttps: boolean | null = null) {
  const enabled = !isEmpty(assetId)
  const eq = getEq()

  return useQuery(eq.queryOptions({
    queryKey: ['assets', 'assetUrl', assetId ?? null, useHttps] as const,
    enabled,
    retry: 0,
    staleTime: Number.POSITIVE_INFINITY,
    queryFn: () => Effect.gen(function* () {
      const id = assetId as string
      yield* Console.debug(`[assets] getAssetUrl start assetId=${id}`)
      const assetsService = yield* AssetsService
      const [duration, url] = yield* Effect.timed(assetsService.getAssetUrl(id, useHttps))
      const ms = Math.round(Duration.toMillis(duration))
      yield* Console.debug(`[assets] getAssetUrl ok assetId=${id} ms=${ms}`)
      return url
    }).pipe(Effect.tapError((error) => {
      const id = assetId as string
      return Console.warn(`[assets] getAssetUrl failed assetId=${id} err=`, error)
    })),
  }))
}
