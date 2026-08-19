import type { EditorStorage, MainDatabaseSchemaInspection } from '@memorilo/editor-storage'
import type { ExpoEditorStorageDatabase, ExpoSqliteCapabilities } from '@memorilo/editor-storage-expo'
import type { ShelfStorage } from '@memorilo/shelf'
import { ShelfCatalogApplication, ShelfSourceApplication } from '@memorilo/application'
import {
  inspectMainDatabaseSchema,
  mainDatabaseSchemaGeneration,
  SqliteEditorStorage,
  SqliteShelfImageCache,
  SqliteShelfStorage,
} from '@memorilo/editor-storage'
import { verifyExpoSqliteCapabilities } from '@memorilo/editor-storage-expo'
import { createOperationSupervisor, createResourceScope } from '@memorilo/effect-lifecycle'
import { fetchShelfAsset, fetchShelfPage, fetchShelfPublication } from '@memorilo/shelf'
import { openMobileDatabase, openMobileShelfImageCacheDatabase } from '@/database/mobile-database'
import { MobileDatabaseTransfer } from '@/database/mobile-database-transfer'
import { MobileAssetLibrary } from '@/files/mobile-asset-library'
import { MobileReadingLibrary } from '@/files/mobile-reading-library'
import { MobileStorageManager } from '@/files/mobile-storage'
import { MobileEmbeddingModel } from './mobile-embedding-model'
import { optimizeMobileFsrsParameters } from './mobile-fsrs-optimizer'
import { MobileLearningConfiguration } from './mobile-learning-configuration'
import { MobileShelfCredentials } from './mobile-shelf'

export interface MobileRuntime {
  close: () => Promise<void>
  database: ExpoEditorStorageDatabase
  databaseTransfer: MobileDatabaseTransfer
  capabilities: ExpoSqliteCapabilities
  databaseGeneration: number
  editor: EditorStorage
  assets: MobileAssetLibrary
  learningConfiguration: MobileLearningConfiguration
  phase: 'ready'
  readings: MobileReadingLibrary
  schema: MainDatabaseSchemaInspection
  shelf: ShelfStorage
  shelfCatalog: ShelfCatalogApplication
  shelfImageCache: SqliteShelfImageCache
  shelfSources: ShelfSourceApplication
  storage: MobileStorageManager
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
    const learningConfiguration = (await scope.acquire({
      acquire: MobileLearningConfiguration.open,
      close: current => current.close(),
      name: 'learning configuration',
    })).resource
    const editor = (await scope.acquire({
      acquire: () => SqliteEditorStorage.open({
        database,
        databaseOwnership: 'borrowed',
        embeddingModel,
        learningConfiguration: () => learningConfiguration.get(),
        optimizeFsrsParameters: optimizeMobileFsrsParameters,
        operationSupervisor: operations,
      }),
      close: current => current.close(),
      name: 'editor storage',
    })).resource
    const assets = (await scope.acquire({
      acquire: () => MobileAssetLibrary.open({ registerAsset: editor.assets.register, storage: editor.assets }),
      close: current => current.close(),
      name: 'mobile asset library',
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
    const shelfImageCacheDatabase = (await scope.acquire({
      acquire: openMobileShelfImageCacheDatabase,
      close: current => current.close(),
      name: 'shelf image cache database',
    })).resource
    const imageCache = (await scope.acquire({
      acquire: () => SqliteShelfImageCache.open({ database: shelfImageCacheDatabase }),
      close: current => current.close(),
      name: 'shelf image cache',
    })).resource
    const credentials = new MobileShelfCredentials()
    const shelfDependencies = {
      credentials,
      fetchAsset: (input: Parameters<typeof fetchShelfAsset>[0]) => fetchShelfAsset(input),
      fetchPage: (input: Parameters<typeof fetchShelfPage>[0]) => fetchShelfPage(input),
      fetchPublication: (input: Parameters<typeof fetchShelfPublication>[0]) => fetchShelfPublication(input),
      imageCache,
      now: Date.now,
      randomId: crypto.randomUUID,
      storage: shelf,
    }
    const shelfSources = new ShelfSourceApplication(shelfDependencies)
    const shelfCatalog = new ShelfCatalogApplication(shelfDependencies)
    const readings = (await scope.acquire({
      acquire: MobileReadingLibrary.open,
      close: current => current.close(),
      name: 'mobile reading library',
    })).resource
    const databaseTransfer = new MobileDatabaseTransfer({ database })
    const storage = new MobileStorageManager()
    const schema = await inspectMainDatabaseSchema(database)
    const capabilities = await verifyExpoSqliteCapabilities(database)
    scope.commit()
    return {
      close: scope.close,
      database,
      databaseTransfer,
      capabilities,
      databaseGeneration: mainDatabaseSchemaGeneration,
      editor,
      assets,
      learningConfiguration,
      phase: 'ready',
      readings,
      schema,
      shelf,
      shelfCatalog,
      shelfImageCache: imageCache,
      shelfSources,
      storage,
    }
  }
  catch (error) {
    return scope.rollback(error)
  }
}
