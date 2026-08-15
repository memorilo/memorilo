import { randomUUID } from 'node:crypto'
import { cp, mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { combineLifecycleFailures } from '@memorilo/effect-lifecycle'

import { workspaceDirectory } from '../storage/workspace-paths'
import { inspectDatabase } from './database-backup'
import { extractDatabaseExport } from './database-export'

const restoreStateVersion = 1

type RestoreKind = 'database' | 'export'
type RestorePhase = 'applying' | 'pending'

interface RestoreState {
  kind: RestoreKind
  phase: RestorePhase
  previous: {
    assets: boolean
    database: boolean
    shelf: boolean
  }
  version: typeof restoreStateVersion
}

export interface RestoreTransaction {
  commit: () => Promise<void>
  rollback: () => Promise<void>
}

function restoreRoot(databasePath: string): string {
  const directory = workspaceDirectory(databasePath)
  if (directory === null)
    throw new Error('Database restore is unavailable for an in-memory database')
  return join(directory, '.memorilo-restore')
}

function restoreStatePath(root: string): string {
  return join(root, 'state.json')
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path)
    return true
  }
  catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT')
      return false
    throw error
  }
}

async function writeRestoreState(root: string, state: RestoreState): Promise<void> {
  const temporaryPath = join(root, `.state.${randomUUID()}.tmp`)
  await writeFile(temporaryPath, `${JSON.stringify(state)}\n`, { encoding: 'utf8', flag: 'wx' })
  await rename(temporaryPath, restoreStatePath(root))
}

async function readRestoreState(root: string): Promise<RestoreState | null> {
  let text: string
  try {
    text = await readFile(restoreStatePath(root), 'utf8')
  }
  catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT')
      return null
    throw error
  }
  let value: unknown
  try {
    value = JSON.parse(text)
  }
  catch (error) {
    throw new Error('Pending database restore state is not valid JSON', { cause: error })
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new Error('Pending database restore state must be an object')
  const state = value as Partial<RestoreState>
  if (state.version !== restoreStateVersion
    || (state.kind !== 'database' && state.kind !== 'export')
    || (state.phase !== 'pending' && state.phase !== 'applying')
    || typeof state.previous !== 'object'
    || state.previous === null
    || Array.isArray(state.previous)) {
    throw new Error('Pending database restore state is unsupported')
  }
  const previous = state.previous as Partial<RestoreState['previous']>
  if (typeof previous.assets !== 'boolean'
    || typeof previous.database !== 'boolean'
    || typeof previous.shelf !== 'boolean') {
    throw new TypeError('Pending database restore state has invalid previous paths')
  }
  return {
    kind: state.kind,
    phase: state.phase,
    previous: {
      assets: previous.assets,
      database: previous.database,
      shelf: previous.shelf,
    },
    version: restoreStateVersion,
  }
}

async function prepareRoot(root: string): Promise<void> {
  const state = await readRestoreState(root)
  if (state)
    throw new Error('A database restore is already pending')
  await rm(root, { force: true, recursive: true })
  await mkdir(join(root, 'incoming'), { recursive: true })
}

export async function stageDatabaseRestore(
  sourcePath: string,
  databasePath: string,
): Promise<void> {
  const root = restoreRoot(databasePath)
  await prepareRoot(root)
  const incomingPath = join(root, 'incoming', 'database.sqlite')
  await cp(sourcePath, incomingPath, { force: false })
  inspectDatabase(incomingPath)
  await writeRestoreState(root, {
    kind: 'database',
    phase: 'pending',
    previous: { assets: false, database: false, shelf: false },
    version: restoreStateVersion,
  })
}

export async function stageExportRestore(
  sourcePath: string,
  databasePath: string,
): Promise<void> {
  const root = restoreRoot(databasePath)
  await prepareRoot(root)
  const incomingPath = join(root, 'incoming')
  await extractDatabaseExport(sourcePath, incomingPath)
  await writeRestoreState(root, {
    kind: 'export',
    phase: 'pending',
    previous: { assets: false, database: false, shelf: false },
    version: restoreStateVersion,
  })
}

async function moveIfExists(sourcePath: string, destinationPath: string): Promise<boolean> {
  if (!await exists(sourcePath))
    return false
  await mkdir(dirname(destinationPath), { recursive: true })
  await rename(sourcePath, destinationPath)
  return true
}

async function removeIfExists(path: string): Promise<void> {
  await rm(path, { force: true, recursive: true })
}

async function moveDatabaseToPrevious(
  databasePath: string,
  previousRoot: string,
): Promise<boolean> {
  const moved = await moveIfExists(databasePath, join(previousRoot, 'database.sqlite'))
  await moveIfExists(`${databasePath}-wal`, join(previousRoot, 'database.sqlite-wal'))
  await moveIfExists(`${databasePath}-shm`, join(previousRoot, 'database.sqlite-shm'))
  return moved
}

async function restoreDatabaseFromPrevious(
  databasePath: string,
  previousRoot: string,
  hadDatabase: boolean,
): Promise<void> {
  const previousPath = join(previousRoot, 'database.sqlite')
  if (await exists(previousPath)) {
    await removeIfExists(databasePath)
    await rename(previousPath, databasePath)
    for (const sidecar of ['-wal', '-shm']) {
      const previousSidecar = join(previousRoot, `database.sqlite${sidecar}`)
      if (await exists(previousSidecar))
        await rename(previousSidecar, `${databasePath}${sidecar}`)
    }
    return
  }
  if (!hadDatabase)
    await removeIfExists(databasePath)
}

async function rollbackRestore(
  root: string,
  databasePath: string,
  state: RestoreState,
): Promise<void> {
  const previousRoot = join(root, 'previous')
  await restoreDatabaseFromPrevious(databasePath, previousRoot, state.previous.database)
  if (state.kind === 'export') {
    const directory = workspaceDirectory(databasePath)
    if (directory === null)
      throw new Error('Database restore workspace disappeared during rollback')
    for (const [name, hadDirectory] of [
      ['assets', state.previous.assets],
      ['shelf', state.previous.shelf],
    ] as const) {
      const previousPath = join(previousRoot, name)
      const livePath = join(directory, name)
      if (await exists(previousPath)) {
        await removeIfExists(livePath)
        await rename(previousPath, livePath)
      }
      else if (!hadDirectory) {
        await removeIfExists(livePath)
      }
    }
  }
  await removeIfExists(root)
}

export async function applyPendingRestore(databasePath: string): Promise<RestoreTransaction | null> {
  if (databasePath === ':memory:')
    return null
  const root = restoreRoot(databasePath)
  const state = await readRestoreState(root)
  if (state === null)
    return null
  if (state.phase === 'applying') {
    await rollbackRestore(root, databasePath, state)
    return null
  }

  const directory = workspaceDirectory(databasePath)
  if (directory === null)
    throw new Error('Database restore workspace disappeared')
  const previousRoot = join(root, 'previous')
  await removeIfExists(previousRoot)
  await mkdir(previousRoot, { recursive: true })
  const previous = {
    assets: state.kind === 'export' && await exists(join(directory, 'assets')),
    database: await exists(databasePath),
    shelf: state.kind === 'export' && await exists(join(directory, 'shelf')),
  }
  const applyingState: RestoreState = { ...state, phase: 'applying', previous }
  await writeRestoreState(root, applyingState)

  try {
    await moveDatabaseToPrevious(databasePath, previousRoot)
    const incomingRoot = join(root, 'incoming')
    await rename(join(incomingRoot, 'database.sqlite'), databasePath)
    if (state.kind === 'export') {
      for (const name of ['assets', 'shelf']) {
        const livePath = join(directory, name)
        await moveIfExists(livePath, join(previousRoot, name))
        await rename(join(incomingRoot, name), livePath)
      }
    }
    await writeRestoreState(root, { ...applyingState, phase: 'applying' })
    return {
      commit: () => removeIfExists(root),
      rollback: async () => rollbackRestore(root, databasePath, applyingState),
    }
  }
  catch (error) {
    try {
      await rollbackRestore(root, databasePath, applyingState)
    }
    catch (rollbackError) {
      throw combineLifecycleFailures(
        [error, rollbackError],
        'Database restore failed and could not be rolled back',
      )
    }
    throw error
  }
}
