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
  if (typeof error === 'string') {
    return new Error(error)
  }
  if (error && typeof error === 'object') {
    const record = error as Record<string, unknown>
    const message = typeof record.message === 'string' ? record.message : undefined
    const innerMessage = typeof record.inner_message === 'string' ? record.inner_message : undefined
    if (message || innerMessage) {
      return new Error([message, innerMessage].filter(Boolean).join(': '))
    }
    try {
      return new Error(JSON.stringify(error))
    }
    catch {
      return new Error(String(error))
    }
  }
  return new Error(String(error))
}

export function wrapCommand<K extends keyof Commands>(
  key: K,
): (...args: Parameters<Commands[K]>) => Effect.Effect<Awaited<ReturnType<Commands[K]>>, CommandError<Error>> {
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
  }) as (...args: Args) => Effect.Effect<FnReturn, CommandError<Error>>
}
