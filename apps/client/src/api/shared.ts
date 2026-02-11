import type { Channel as ApiChannel } from '@memorilo/api-spec/channel'
import type { ApiError } from '@memorilo/api-spec/services/common'
import type { Channel as TauriChannel } from '@tauri-apps/api/core'
import { CommandError } from '@memorilo/api-spec/services/shared'
import { Effect } from 'effect'
import { commands } from './bindings.gen'

type Handlers = typeof commands

type CommandFailure = ApiError | Error

type UnwrapResult<T>
  = T extends { status: 'ok', data: infer D }
    ? D
    : T extends { status: 'error', error: CommandFailure }
      ? never
      : T

type NormalizeChannel<T>
  = T extends TauriChannel<infer U>
    ? ApiChannel<U>
    : T

type NormalizeArgs<T> = {
  [K in keyof T]: NormalizeChannel<T[K]>
}

function toCommandError(error: CommandFailure | string | { message?: string, inner_message?: string, _tag?: string } | null | undefined): CommandError<CommandFailure> {
  return new CommandError({
    error: normalizeError(error),
  })
}

function normalizeError(error: CommandFailure | string | { message?: string, inner_message?: string, _tag?: string } | null | undefined): CommandFailure {
  if (error && typeof error === 'object' && '_tag' in error) {
    const record = error as { _tag?: string, message?: string, inner_message?: string }
    if (record._tag && record.message && record.inner_message) {
      return record as ApiError
    }
  }
  if (error instanceof Error) {
    return error
  }
  if (typeof error === 'string') {
    return new Error(error)
  }
  if (error && typeof error === 'object') {
    const record = error as { message?: string, inner_message?: string }
    const message = typeof record.message === 'string' ? record.message : undefined
    const innerMessage = typeof record.inner_message === 'string' ? record.inner_message : undefined
    if (message || innerMessage) {
      return {
        _tag: 'StateError',
        message: message ?? 'Unknown error',
        inner_message: innerMessage ?? '',
      }
    }
    return new Error(String(error))
  }
  return new Error(String(error))
}

export function wrapCommand<K extends keyof Handlers>(
  key: K,
): (...args: NormalizeArgs<Parameters<Handlers[K]>>) => Effect.Effect<UnwrapResult<Awaited<ReturnType<Handlers[K]>>>, CommandError<CommandFailure>> {
  type Fn = Handlers[K]
  type Args = Parameters<Fn>
  type FnReturn = Awaited<ReturnType<Fn>>
  const fn = commands[key] as (...args: Args) => Promise<FnReturn>
  return ((...args: Parameters<Fn>) => {
    return Effect.promise<FnReturn>(() => fn(...args as Args)).pipe(
      Effect.mapError(toCommandError),
      Effect.flatMap((res: FnReturn) => {
        if (typeof res === 'object' && res !== null && 'status' in res) {
          const result = res as { status: 'ok', data: UnwrapResult<FnReturn> } | { status: 'error', error: CommandFailure }
          if (result.status === 'error') {
            return Effect.fail(toCommandError(result.error))
          }
          if (result.status === 'ok') {
            return Effect.succeed(result.data)
          }
        }
        return Effect.succeed(res as UnwrapResult<FnReturn>)
      }),
    )
  }) as (...args: NormalizeArgs<Args>) => Effect.Effect<UnwrapResult<FnReturn>, CommandError<CommandFailure>>
}
