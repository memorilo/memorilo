import { resolveResource as resolveResourcePrimivate } from '@tauri-apps/api/path'
import { readFile as readFilePrimivate } from '@tauri-apps/plugin-fs'
import { Effect } from 'effect'

export function resolveResource(path: string) {
  return Effect.tryPromise(async () => resolveResourcePrimivate(path))
}

export function readFile(path: string) {
  return Effect.tryPromise(async () => readFilePrimivate(path))
}

export function readResource(path: string) {
  return Effect.gen(function* () {
    const p = yield* resolveResource(path)
    return yield* readFile(p)
  })
}

export function readResourceText(path: string) {
  return Effect.gen(function* () {
    const buff = yield* readResource(path)
    return new TextDecoder().decode(buff)
  })
}
