import { prepareMainDatabase } from '@memorilo/editor-storage'
import { combineLifecycleFailures } from '@memorilo/effect-lifecycle'
import { BetterSqliteDatabase } from './better-sqlite-database'

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

export async function openCurrentMainDatabase(path: string): Promise<BetterSqliteDatabase> {
  const database = new BetterSqliteDatabase(path)
  try {
    await prepareMainDatabase(database)
    return database
  }
  catch (error) {
    return closeAfterFailure(database, error, 'Failed to inspect and close the main database')
  }
}
