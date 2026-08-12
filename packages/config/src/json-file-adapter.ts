import type { ConfigurationAdapter } from './configuration-store'
import { watch } from 'node:fs'
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'
import process from 'node:process'
import { combineLifecycleFailures } from '@memorilo/effect-lifecycle'
import { Effect, Semaphore } from 'effect'
import { setConfigurationValue } from './configuration-path'

export interface JsonFileConfigurationAdapterOptions {
  debounceMs?: number
  migrate?: (configuration: unknown) => unknown
}

let temporaryFileSequence = 0

interface FileOperationLane {
  readonly semaphore: ReturnType<typeof Semaphore.makeUnsafe>
  users: number
}

const fileOperationLanes = new Map<string, FileOperationLane>()

function pathIdentity(path: string): string {
  const absolutePath = resolve(path)
  return process.platform === 'win32' ? absolutePath.toLocaleLowerCase('en-US') : absolutePath
}

function releaseFileOperationLane(identity: string, lane: FileOperationLane): void {
  lane.users -= 1
  if (lane.users === 0 && fileOperationLanes.get(identity) === lane)
    fileOperationLanes.delete(identity)
}

function withFileOperation<Result, Failure>(
  path: string,
  operation: Effect.Effect<Result, Failure>,
): Effect.Effect<Result, Failure> {
  const identity = pathIdentity(path)
  return Effect.acquireUseRelease(
    Effect.sync(() => {
      let lane = fileOperationLanes.get(identity)
      if (!lane) {
        lane = { semaphore: Semaphore.makeUnsafe(1), users: 0 }
        fileOperationLanes.set(identity, lane)
      }
      lane.users += 1
      return lane
    }),
    lane => lane.semaphore.withPermit(operation),
    lane => Effect.sync(() => releaseFileOperationLane(identity, lane)),
  )
}

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
  const migrate = options.migrate
  if (!Number.isFinite(debounceMs) || debounceMs < 0)
    throw new RangeError('Configuration watcher debounce must be non-negative')

  const writeAtomically = (configuration: unknown): Effect.Effect<void, unknown> => Effect.gen(function* () {
    yield* Effect.tryPromise({ catch: error => error, try: () => mkdir(directory, { recursive: true }) })
    temporaryFileSequence += 1
    const temporaryPath = join(directory, `.${filename}.${process.pid}.${temporaryFileSequence}.tmp`)
    return yield* Effect.gen(function* () {
      const serialized = yield* Effect.try({
        catch: error => error,
        try: () => `${JSON.stringify(configuration, null, 2)}\n`,
      })
      yield* Effect.tryPromise({
        catch: error => error,
        try: () => writeFile(temporaryPath, serialized, { encoding: 'utf8', mode: 0o600 }),
      })
      yield* Effect.tryPromise({ catch: error => error, try: () => rename(temporaryPath, path) })
    }).pipe(Effect.catchEager(writeError => Effect.tryPromise({
      catch: error => error,
      try: () => rm(temporaryPath, { force: true }),
    }).pipe(
      Effect.catchEager(cleanupError => Effect.fail(combineLifecycleFailures(
        [writeError, cleanupError],
        `Failed to write configuration ${path} and clean up ${temporaryPath}`,
      ))),
      Effect.andThen(Effect.fail(writeError)),
    )))
  })

  const readPersisted = (): Effect.Effect<unknown | null, unknown> => Effect.tryPromise({
    catch: error => error,
    try: async () => {
      try {
        return JSON.parse(await readFile(path, 'utf8')) as unknown
      }
      catch (error) {
        if (isMissingFile(error))
          return null
        throw error
      }
    },
  })

  const readCurrent = (persistMigration: boolean): Effect.Effect<unknown | null, unknown> => Effect.gen(function* () {
    const persisted = yield* readPersisted()
    if (persisted === null || !migrate)
      return persisted
    const migrated = yield* Effect.try({
      catch: error => error,
      try: () => migrate(persisted),
    })
    if (persistMigration && migrated !== persisted)
      yield* writeAtomically(migrated)
    return migrated
  })

  return {
    read: () => Effect.runPromise(withFileOperation(path, readCurrent(true))),
    setValue: (configurationPath, value) => Effect.runPromise(withFileOperation(path, Effect.gen(function* () {
      const persisted = yield* readCurrent(false)
      if (persisted === null)
        return yield* Effect.fail(new Error(`Configuration ${path} disappeared from storage`))
      if (typeof persisted !== 'object' || persisted === null || Array.isArray(persisted))
        return yield* Effect.fail(new TypeError(`Configuration ${path} must contain a JSON object`))
      const updated = yield* Effect.try({
        catch: error => error,
        try: () => setConfigurationValue(persisted, configurationPath, value),
      })
      yield* writeAtomically(updated)
      return updated
    }))),
    subscribe: async (listener) => {
      await mkdir(directory, { recursive: true })
      let timer: ReturnType<typeof setTimeout> | undefined
      let closed = false
      const watcher = watch(directory, { persistent: false }, (_event, changedFilename) => {
        if (closed)
          return
        if (changedFilename !== null && changedFilename.toString() !== filename)
          return
        if (timer !== undefined)
          clearTimeout(timer)
        timer = setTimeout(() => {
          timer = undefined
          if (closed)
            return
          listener({ type: 'changed' })
        }, debounceMs)
      })
      watcher.on('error', (error) => {
        if (!closed)
          listener({ error, type: 'failed' })
      })
      return () => {
        if (closed)
          return
        closed = true
        if (timer !== undefined)
          clearTimeout(timer)
        try {
          watcher.close()
        }
        catch (error) {
          closed = false
          throw error
        }
      }
    },
    write: configuration => Effect.runPromise(withFileOperation(path, writeAtomically(configuration))),
  }
}
