import { dirname, isAbsolute, join, resolve } from 'node:path'
import process from 'node:process'

export function mainDatabasePath(userDataPath: string): string {
  const configured = process.env.MEMORILO_DATABASE_PATH
  if (configured === undefined)
    return join(userDataPath, 'memorilo.sqlite')
  if (configured.length === 0)
    throw new TypeError('MEMORILO_DATABASE_PATH must not be empty')
  return configured
}

export function workspaceDirectory(databasePath: string): string | null {
  if (databasePath === ':memory:')
    return null
  const absoluteDatabase = isAbsolute(databasePath) ? databasePath : resolve(databasePath)
  return dirname(absoluteDatabase)
}

export function assetDirectory(databasePath: string): string | null {
  const directory = workspaceDirectory(databasePath)
  return directory === null ? null : join(directory, 'assets')
}

export function automaticBackupDirectory(databasePath: string): string | null {
  const directory = workspaceDirectory(databasePath)
  return directory === null ? null : join(directory, 'backup')
}

export function shelfLibraryDirectory(databasePath: string, userDataPath: string): string {
  const directory = workspaceDirectory(databasePath)
  return directory === null ? join(userDataPath, 'shelf') : join(directory, 'shelf')
}
