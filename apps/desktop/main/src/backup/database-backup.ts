import type { BetterSqliteDatabase } from '../storage/better-sqlite-database'
import { randomUUID } from 'node:crypto'
import { mkdir, readdir, rename, rm } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'

import { combineLifecycleFailures, toError } from '@memorilo/effect-lifecycle'
import BetterSqlite3 from 'better-sqlite3'
import { sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/better-sqlite3'

const automaticBackupPattern = /^memorilo-\d{8}T\d{6}Z-[0-9a-f-]+\.sqlite$/u

export interface DatabaseInspection {
  userVersion: number
}

function automaticBackupTimestamp(now: Date): string {
  return now.toISOString()
    .replace(/[-:]/gu, '')
    .replace(/\.\d{3}/u, '')
}

export function inspectDatabase(path: string): DatabaseInspection {
  const database = new BetterSqlite3(path, { fileMustExist: true, readonly: true })
  const orm = drizzle(database)
  let inspection: DatabaseInspection
  try {
    const integrity = orm.all<Record<string, unknown>>(sql`PRAGMA integrity_check`)
    const messages = integrity.flatMap(row => Object.values(row))
    if (messages.length !== 1 || messages[0] !== 'ok')
      throw new Error(`SQLite integrity check failed: ${messages.map(String).join('; ')}`)
    const version = orm.get<{ user_version: number }>(sql`PRAGMA user_version`)
    const userVersion = version?.user_version
    if (!Number.isSafeInteger(userVersion) || userVersion < 0)
      throw new Error('SQLite database has an invalid schema generation')
    inspection = { userVersion }
  }
  catch (error) {
    const inspectionError = toError(error)
    try {
      database.close()
    }
    catch (closeError) {
      throw combineLifecycleFailures(
        [inspectionError, closeError],
        `Database inspection and close failed for ${path}`,
      )
    }
    throw inspectionError
  }
  database.close()
  return inspection
}

export async function createDatabaseSnapshot(
  database: BetterSqliteDatabase,
  destinationPath: string,
): Promise<DatabaseInspection> {
  await mkdir(dirname(destinationPath), { recursive: true })
  const temporaryPath = join(
    dirname(destinationPath),
    `.${basename(destinationPath)}.${randomUUID()}.tmp`,
  )
  try {
    await database.backup(temporaryPath)
    const inspection = inspectDatabase(temporaryPath)
    await rename(temporaryPath, destinationPath)
    return inspection
  }
  catch (error) {
    const snapshotError = toError(error)
    try {
      await rm(temporaryPath, { force: true })
    }
    catch (cleanupError) {
      throw combineLifecycleFailures(
        [snapshotError, cleanupError],
        `Database snapshot and temporary-file cleanup failed for ${destinationPath}`,
      )
    }
    throw snapshotError
  }
}

export async function createAutomaticDatabaseBackup(
  database: BetterSqliteDatabase,
  backupDirectory: string,
  retentionCount: number,
  now: Date = new Date(),
): Promise<string> {
  if (!Number.isSafeInteger(retentionCount) || retentionCount < 1)
    throw new RangeError('Automatic backup retention must be a positive integer')
  await mkdir(backupDirectory, { recursive: true })
  const fileName = `memorilo-${automaticBackupTimestamp(now)}-${randomUUID()}.sqlite`
  const destinationPath = join(backupDirectory, fileName)
  await createDatabaseSnapshot(database, destinationPath)

  const backups = (await readdir(backupDirectory, { withFileTypes: true }))
    .filter(entry => entry.isFile() && automaticBackupPattern.test(entry.name))
    .map(entry => entry.name)
    .sort((left, right) => right.localeCompare(left))
  await Promise.all(backups.slice(retentionCount).map(name => (
    rm(join(backupDirectory, name), { force: true })
  )))
  return destinationPath
}
