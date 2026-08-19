import type { ExpoEditorStorageDatabase } from '@memorilo/editor-storage-expo'
import {
  openExpoEditorStorageDatabase,
  registerBundledExpoSqliteExtensions,
} from '@memorilo/editor-storage-expo'
import { prepareMainDatabase } from '@memorilo/editor-storage/database'
import { applyPendingMobileDatabaseImport } from './mobile-database-transfer'

export const mobileDatabaseName = 'memorilo.sqlite'
export const mobileShelfImageCacheDatabaseName = 'memorilo-shelf-images.sqlite'

export async function openMobileDatabase(): Promise<ExpoEditorStorageDatabase> {
  await applyPendingMobileDatabaseImport()
  const database = await openExpoEditorStorageDatabase({
    databaseName: mobileDatabaseName,
    registerExtensions: registerBundledExpoSqliteExtensions,
  })
  try {
    await prepareMainDatabase(database)
    return database
  }
  catch (error) {
    await database.close()
    throw error
  }
}

/** Shelf cover bytes are a cache and must not add objects to the canonical main database. */
export function openMobileShelfImageCacheDatabase(): Promise<ExpoEditorStorageDatabase> {
  return openExpoEditorStorageDatabase({
    databaseName: mobileShelfImageCacheDatabaseName,
    registerExtensions: registerBundledExpoSqliteExtensions,
  })
}
