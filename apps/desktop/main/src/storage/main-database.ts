import { rm } from 'node:fs/promises'
import { combineLifecycleFailures } from '@memorilo/effect-lifecycle'
import { BetterSqliteDatabase } from './better-sqlite-database'

export const mainDatabaseSchemaGeneration = 1

interface UserVersionRow {
  user_version: number
}

async function markCurrentGeneration(database: BetterSqliteDatabase): Promise<void> {
  await database.exec(`PRAGMA user_version = ${mainDatabaseSchemaGeneration}`)
}

async function closeAfterFailure(
  database: BetterSqliteDatabase,
  error: unknown,
  message: string,
): Promise<never> {
  try {
    await database.close()
  }
  catch (cleanupError) {
    throw combineLifecycleFailures([error, cleanupError], message)
  }
  throw error
}

async function removeSqliteFiles(path: string): Promise<void> {
  await Promise.all([
    rm(path, { force: true }),
    rm(`${path}-shm`, { force: true }),
    rm(`${path}-wal`, { force: true }),
  ])
}

async function openFreshDatabase(path: string): Promise<BetterSqliteDatabase> {
  const database = new BetterSqliteDatabase(path)
  try {
    await markCurrentGeneration(database)
    return database
  }
  catch (error) {
    return closeAfterFailure(database, error, 'Failed to initialize and close the main database')
  }
}

export async function openCurrentMainDatabase(path: string): Promise<BetterSqliteDatabase> {
  const database = new BetterSqliteDatabase(path)
  try {
    const version = await database.get<UserVersionRow>('PRAGMA user_version')
    if (!version || !Number.isSafeInteger(version.user_version) || version.user_version < 0)
      throw new Error('The main database has an invalid schema generation')
    if (version.user_version === mainDatabaseSchemaGeneration)
      return database

    const existingTable = await database.get<{ name: string }>(`
      SELECT name
      FROM sqlite_master
      WHERE type = 'table'
        AND name NOT LIKE 'sqlite_%'
      LIMIT 1
    `)
    if (version.user_version === 0 && existingTable === undefined) {
      await markCurrentGeneration(database)
      return database
    }

    await database.close()
    if (path !== ':memory:')
      await removeSqliteFiles(path)
    return openFreshDatabase(path)
  }
  catch (error) {
    return closeAfterFailure(database, error, 'Failed to inspect and close the main database')
  }
}
