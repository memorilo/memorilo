import { resolveResource } from '@tauri-apps/api/path'
import { readFile, readTextFile } from '@tauri-apps/plugin-fs'
import { Effect } from 'effect'

export const resourceHandlers = {
  readLanguagedetectionModelJSON: () => {
    return Effect.tryPromise(async () => {
      const path = await resolveResource('models/vscode-languagedetection.json')
      const data = await readTextFile(path)
      return data
    })
  },
  readLanguagedetectionModelWeights: () => {
    return Effect.tryPromise(async () => {
      const path = await resolveResource('models/vscode-languagedetection.bin')
      const data = await readFile(path)
      return new Uint8Array(data)
    })
  },
}
