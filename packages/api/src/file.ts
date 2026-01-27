import { resolveResource as resolveResourcePrimivate } from '@tauri-apps/api/path'
import { readFile as readFilePrimivate } from '@tauri-apps/plugin-fs'
import { Data, Effect } from 'effect'

export class ResourceReadError extends Data.TaggedError('ResourceReadError')<{
  path: string
  message: string
}> {}

export function resolveResource(path: string) {
  return Effect.tryPromise(async () => resolveResourcePrimivate(path))
}

export function readFile(path: string) {
  return Effect.tryPromise(async () => readFilePrimivate(path))
}

export function readResource(path: string) {
  return Effect.gen(function* () {
    const p = yield* resolveResource(path)
    const buff = yield* readFile(p)
    if (!(buff instanceof Uint8Array)) {
      return yield* Effect.fail(
        new ResourceReadError({
          path,
          message: 'Resource is not binary',
        }),
      )
    }
    if (buff.byteLength === 0) {
      return yield* Effect.fail(
        new ResourceReadError({
          path,
          message: 'Resource is empty',
        }),
      )
    }
    return buff
  })
}

export function readResourceText(path: string) {
  return Effect.gen(function* () {
    const buff = yield* readResource(path)
    return new TextDecoder().decode(buff)
  })
}
