import type { Effectify } from '@memorilo/api-spec/command'
import { CommandError } from '@memorilo/api-spec/command'
import { Effect } from 'effect'
import { commands } from '../bindings.gen'

type Commands = typeof commands

function toCommandError(error: unknown): CommandError<Error> {
  return new CommandError({
    error: normalizeError(error),
  })
}

function normalizeError(error: unknown): Error {
  if (error instanceof Error) {
    return error
  }
  return new Error(String(error))
}

export function wrapCommand<K extends keyof Commands>(key: K): Effectify<Commands>[K] {
  type Fn = Commands[K]
  type Args = Parameters<Fn>
  type FnReturn = Awaited<ReturnType<Fn>>
  const fn = commands[key] as (...args: Args) => Promise<FnReturn>
  return ((...args: Parameters<Fn>) => {
    return Effect.promise<FnReturn>(() => fn(...args as Args)).pipe(
      Effect.mapError(toCommandError),
      Effect.flatMap((res: any) => {
        if (typeof res === 'object' && res !== null && 'status' in res) {
          if (res.status === 'error') {
            return Effect.fail(toCommandError(res.error))
          }
          if (res.status === 'ok') {
            return Effect.succeed(res.data)
          }
        }
        return Effect.succeed(res)
      }),
    )
  }) as Effectify<Commands>[K]
}
