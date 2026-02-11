import { ResourceReadError } from '@memorilo/api-spec/services/file'
import { resolveResource as resolveResourcePrimivate } from '@tauri-apps/api/path'
import { readFile as readFilePrimivate } from '@tauri-apps/plugin-fs'
import { Effect } from 'effect'

export const fileHandlers = {
  resolveResource: (path: string) =>
    Effect.tryPromise({
      try: () => resolveResourcePrimivate(path),
      catch: cause => new ResourceReadError({
        path,
        message: String(cause),
      }),
    }),
  readFile: (path: string) =>
    Effect.tryPromise({
      try: () => readFilePrimivate(path),
      catch: cause => new ResourceReadError({
        path,
        message: String(cause),
      }),
    }),
  readResource: (path: string) =>
    Effect.gen(function* () {
      const p = yield* fileHandlers.resolveResource(path)
      const buff = yield* fileHandlers.readFile(p)
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
    }),
  readResourceText: (path: string) =>
    Effect.gen(function* () {
      const buff = yield* fileHandlers.readResource(path)
      return new TextDecoder().decode(buff)
    }),
}
