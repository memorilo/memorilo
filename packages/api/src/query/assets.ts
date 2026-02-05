import { useQuery } from '@tanstack/react-query'
import { Duration, Effect } from 'effect'
import { eq } from '../index'
import log from '../log'
import { effectCommands } from '../native/effect'

export function useAssetUrl(assetId: string | null | undefined, useHttps: boolean | null = null) {
  const enabled = typeof assetId === 'string' && assetId.length > 0

  return useQuery(eq.queryOptions({
    queryKey: ['assets', 'assetUrl', assetId ?? null, useHttps] as const,
    enabled,
    // Avoid retries: missing assets should fail fast and surface a placeholder in UI.
    retry: 0,
    // Asset URLs are stable for a given id (until delete), so cache forever.
    staleTime: Number.POSITIVE_INFINITY,
    queryFn: () => Effect.gen(function* () {
      const id = assetId as string
      log.debug(`[assets] getAssetUrl start assetId=${id}`)
      const [duration, url] = yield* Effect.timed(effectCommands.getAssetUrl(id, useHttps))
      const ms = Math.round(Duration.toMillis(duration))
      log.debug(`[assets] getAssetUrl ok assetId=${id} ms=${ms}`)
      return url
    }).pipe(Effect.tapError((error) => {
      const id = assetId as string
      log.warn(`[assets] getAssetUrl failed assetId=${id} err=`, error)
      return Effect.succeed(null)
    })),
  }))
}
