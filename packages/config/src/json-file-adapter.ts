import type { ConfigurationAdapter } from './configuration-store'
import { watch } from 'node:fs'
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import process from 'node:process'

export interface JsonFileConfigurationAdapterOptions {
  debounceMs?: number
}

let temporaryFileSequence = 0

function isMissingFile(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT'
}

export function createJsonFileConfigurationAdapter(
  path: string,
  options: JsonFileConfigurationAdapterOptions = {},
): ConfigurationAdapter {
  if (path.length === 0)
    throw new TypeError('Configuration file path must not be empty')
  const directory = dirname(path)
  const filename = basename(path)
  const debounceMs = options.debounceMs ?? 30
  if (!Number.isFinite(debounceMs) || debounceMs < 0)
    throw new RangeError('Configuration watcher debounce must be non-negative')

  return {
    read: async () => {
      try {
        return JSON.parse(await readFile(path, 'utf8')) as unknown
      }
      catch (error) {
        if (isMissingFile(error))
          return null
        throw error
      }
    },
    subscribe: (listener) => {
      let timer: ReturnType<typeof setTimeout> | undefined
      const watcher = watch(directory, { persistent: false }, (_event, changedFilename) => {
        if (changedFilename !== null && changedFilename.toString() !== filename)
          return
        if (timer !== undefined)
          clearTimeout(timer)
        timer = setTimeout(() => {
          timer = undefined
          listener()
        }, debounceMs)
      })
      return () => {
        if (timer !== undefined)
          clearTimeout(timer)
        watcher.close()
      }
    },
    write: async (configuration) => {
      await mkdir(directory, { recursive: true })
      temporaryFileSequence += 1
      const temporaryPath = join(directory, `.${filename}.${process.pid}.${temporaryFileSequence}.tmp`)
      try {
        const serialized = `${JSON.stringify(configuration, null, 2)}\n`
        await writeFile(temporaryPath, serialized, { encoding: 'utf8', mode: 0o600 })
        await rename(temporaryPath, path)
      }
      catch (error) {
        await rm(temporaryPath, { force: true })
        throw error
      }
    },
  }
}
