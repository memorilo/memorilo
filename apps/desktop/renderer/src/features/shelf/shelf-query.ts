import type { ShelfPublicationDetails } from '@memorilo/shelf'
import { Data, Effect, Layer } from 'effect'
import { createEffectQuery } from 'effect-query'

// eslint-disable-next-line unicorn/throw-new-error
export class ShelfClientError extends Data.TaggedError('ShelfClientError')<{
  message: string
}> {}

export const shelfEffectQuery = createEffectQuery(Layer.empty)

export function desktopEffect<Result>(operation: () => Promise<Result>): Effect.Effect<Result, ShelfClientError> {
  return Effect.tryPromise({
    try: operation,
    catch: error => new ShelfClientError({
      message: error instanceof Error ? error.message : 'Shelf operation failed.',
    }),
  })
}

export function shelfErrorMessage(error: Error | null): string | null {
  if (error === null)
    return null
  const line = error.message.split('\n').find(value => value.trim().length > 0)
  return line?.replace(/^Error:\s*/u, '') ?? 'Shelf operation failed.'
}

export function shelfPublicationQueryKey(sourceId: string, publicationId: string) {
  return ['shelf-publication', sourceId, publicationId] as const
}

export function cacheShelfPublication(
  publication: ShelfPublicationDetails['publication'],
  source: ShelfPublicationDetails['source'],
): ShelfPublicationDetails {
  return { publication, readingOptions: [], source }
}
