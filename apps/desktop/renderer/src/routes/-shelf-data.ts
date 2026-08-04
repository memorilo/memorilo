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
