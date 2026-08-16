import { Data, Effect, Layer } from 'effect'
import { createEffectQuery } from 'effect-query'

// eslint-disable-next-line unicorn/throw-new-error
export class DesktopClientError extends Data.TaggedError('DesktopClientError')<{
  cause: unknown
  message: string
  operation: string
}> {}

export const desktopEffectQuery = createEffectQuery(Layer.empty)

export function desktopEffect<Result>(
  operation: string,
  request: () => Promise<Result>,
): Effect.Effect<Result, DesktopClientError> {
  if (operation.length === 0)
    throw new TypeError('Desktop operation name must not be empty')
  return Effect.tryPromise({
    try: request,
    catch: cause => new DesktopClientError({
      cause,
      message: cause instanceof Error ? cause.message : `Desktop operation ${operation} failed`,
      operation,
    }),
  })
}
