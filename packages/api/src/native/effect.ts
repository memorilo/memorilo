import type { Result } from './bindings.gen'
import { Effect } from 'effect'
import { commands } from './bindings.gen'

type Commands = typeof commands

type UnwrapResult<T> = [T] extends [Result<infer D, infer E>]
  ? Effect.Effect<D, E>
  : Effect.Effect<T, unknown>

type Effectified<T> = {
  [K in keyof T]: T[K] extends (...args: infer A) => Promise<infer R>
    ? (...args: A) => UnwrapResult<R>
    : never
}

export const effectCommands = Object.fromEntries(
  Object.entries(commands).map(([key, fn]) => [
    key,
    (...args: any[]) =>
      Effect.tryPromise({
        try: () => (fn as any)(...args),
        catch: error => error,
      }).pipe(
        Effect.flatMap((res: any) => {
          if (typeof res === 'object' && res !== null && 'status' in res) {
            if (res.status === 'error') {
              return Effect.fail(res.error)
            }
            if (res.status === 'ok') {
              return Effect.succeed(res.data)
            }
          }
          return Effect.succeed(res)
        }),
      ),
  ]),
) as Effectified<Commands>
