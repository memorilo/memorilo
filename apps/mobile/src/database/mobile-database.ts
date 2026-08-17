import type { ExpoEditorStorageDatabase } from '@memorilo/editor-storage-expo'
import {
  openExpoEditorStorageDatabase,
  registerBundledExpoSqliteExtensions,
} from '@memorilo/editor-storage-expo'
import { prepareMainDatabase } from '@memorilo/editor-storage/database'

const mobileDatabaseName = 'memorilo.sqlite'

export async function openMobileDatabase(): Promise<ExpoEditorStorageDatabase> {
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
