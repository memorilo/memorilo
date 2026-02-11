import { ResourceReadError } from '@memorilo/api-spec/file'
import { resolveResource as resolveResourcePrimivate } from '@tauri-apps/api/path'
import { readFile as readFilePrimivate } from '@tauri-apps/plugin-fs'
import { Effect } from 'effect'

export const fileService = {
  resolveResource: (path: string) =>
    Effect.tryPromise(() => resolveResourcePrimivate(path)),
  readFile: (path: string) =>
    Effect.tryPromise(() => readFilePrimivate(path)),
  readResource: (path: string) =>
    Effect.gen(function* () {
      const p = yield* fileService.resolveResource(path)
      const buff = yield* fileService.readFile(p)
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
      const buff = yield* fileService.readResource(path)
      return new TextDecoder().decode(buff)
    }),
}
