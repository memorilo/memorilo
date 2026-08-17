import type { EditorStorage } from '@memorilo/editor-storage'
import type { ExpoEditorStorageDatabase } from '@memorilo/editor-storage-expo'
import type { ShelfStorage } from '@memorilo/shelf'
import {
  mainDatabaseSchemaGeneration,
  SqliteEditorStorage,
  SqliteShelfStorage,
} from '@memorilo/editor-storage'
import { createOperationSupervisor, createResourceScope } from '@memorilo/effect-lifecycle'
import { openMobileDatabase } from '@/database/mobile-database'
import { MobileReadingLibrary } from '@/files/mobile-reading-library'
import { MobileEmbeddingModel } from './mobile-embedding-model'

export interface MobileRuntime {
  close: () => Promise<void>
  database: ExpoEditorStorageDatabase
  databaseGeneration: number
  editor: EditorStorage
  phase: 'ready'
  readings: MobileReadingLibrary
  shelf: ShelfStorage
}

export async function openMobileRuntime(): Promise<MobileRuntime> {
  const scope = createResourceScope('Mobile application', { closeMode: 'dependent' })
  try {
    const database = (await scope.acquire({
      acquire: openMobileDatabase,
      close: current => current.close(),
      name: 'main database',
    })).resource
    const operations = (await scope.acquire({
      acquire: () => createOperationSupervisor('Mobile database operations'),
      close: current => current.close(),
      name: 'main database operations',
    })).resource
    const embeddingModel = (await scope.acquire({
      acquire: () => new MobileEmbeddingModel(),
      close: current => current.close(),
      name: 'embedding model',
    })).resource
    const editor = (await scope.acquire({
      acquire: () => SqliteEditorStorage.open({
        database,
        databaseOwnership: 'borrowed',
        embeddingModel,
        operationSupervisor: operations,
      }),
      close: current => current.close(),
      name: 'editor storage',
    })).resource
    const shelf = (await scope.acquire({
      acquire: () => SqliteShelfStorage.open({
        database,
        databaseOwnership: 'borrowed',
        operationSupervisor: operations,
      }),
      close: current => current.close(),
      name: 'shelf storage',
    })).resource
    const readings = (await scope.acquire({
      acquire: MobileReadingLibrary.open,
      close: current => current.close(),
      name: 'mobile reading library',
    })).resource
    scope.commit()
    return {
      close: scope.close,
      database,
      databaseGeneration: mainDatabaseSchemaGeneration,
      editor,
      phase: 'ready',
      readings,
      shelf,
    }
  }
  catch (error) {
    return scope.rollback(error)
  }
}
