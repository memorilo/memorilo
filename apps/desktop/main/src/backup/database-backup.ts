import type { BetterSqliteDatabase } from '../storage/better-sqlite-database'
import { randomUUID } from 'node:crypto'
import { mkdir, readdir, rename, rm } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'

import BetterSqlite3 from 'better-sqlite3'

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
  try {
    const integrity = database.prepare('PRAGMA integrity_check').all() as Array<Record<string, unknown>>
    const messages = integrity.flatMap(row => Object.values(row))
    if (messages.length !== 1 || messages[0] !== 'ok')
      throw new Error(`SQLite integrity check failed: ${messages.map(String).join('; ')}`)
    const userVersion = database.pragma('user_version', { simple: true })
    if (!Number.isSafeInteger(userVersion) || (userVersion as number) < 0)
      throw new Error('SQLite database has an invalid schema generation')
    return { userVersion: userVersion as number }
  }
  finally {
    database.close()
  }
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
  let published = false
  try {
    await database.backup(temporaryPath)
    const inspection = inspectDatabase(temporaryPath)
    await rename(temporaryPath, destinationPath)
    published = true
    return inspection
  }
  finally {
    if (!published)
      await rm(temporaryPath, { force: true })
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
