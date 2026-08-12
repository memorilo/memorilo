import type { ConfigurationStore } from '@memorilo/config'
import type { DesktopConfiguration } from '@memorilo/desktop-config'
import type { EditorStorage, LearningStorage } from '@memorilo/editor-storage'
import type { ShelfImageCache, ShelfStorage } from '@memorilo/shelf'
import type { ShelfReadingFileStore } from '@memorilo/shelf/node'
import type { NoteApplicationService } from '../notes/note-application-service'
import type { ActiveReadingRegistry } from '../reading/active-reading-registry'
import type { IpcHandlerHost } from './ipc-handler-registry'
import { createResourceScope } from '@memorilo/effect-lifecycle'
import { ipcMain } from 'electron'
import { createLearningReviewApplication } from '../learning/learning-review-application'

import { createAppHandlers } from './app-service'
import { createAssetHandlers } from './asset-service'
import { BookReadingApplication } from './book-reading-application'
import { createBookHandlers } from './book-service'
import { createConfigurationHandlers } from './configuration-service'
import { createIpcHandlerRegistry } from './ipc-handler-registry'
import { createJournalHandlers } from './journal-service'
import { createLearningHandlers } from './learning-service'
import { createNoteHandlers } from './note-service'
import { createShelfOperationRuntime } from './shelf-operation-runtime'
import { createShelfHandlers } from './shelf-service'
import { createWindowHandlers } from './window-service'

const maximumConcurrentShelfAssetRequests = 3

export async function createDesktopServices(
  notes: NoteApplicationService,
  storage: EditorStorage,
  shelfStorage: ShelfStorage,
  shelfImageCache: ShelfImageCache,
  shelfReadingFiles: ShelfReadingFileStore,
  configuration: ConfigurationStore<DesktopConfiguration>,
  assetDirectory: string | null,
  serializeAssetOperation: <Result>(operation: () => Promise<Result>) => Promise<Result>,
  activeReadings: ActiveReadingRegistry,
  learning: LearningStorage,
  now: () => number = Date.now,
) {
  const scope = createResourceScope('Desktop IPC services', { closeMode: 'dependent' })
  try {
    const shelfOperations = (await scope.acquire({
      acquire: () => createShelfOperationRuntime(maximumConcurrentShelfAssetRequests),
      close: operations => operations.close(),
      name: 'Shelf operations',
    })).resource
    await scope.acquire({
      acquire: () => createIpcHandlerRegistry({
        app: createAppHandlers(),
        assets: createAssetHandlers(assetDirectory, storage, configuration, serializeAssetOperation),
        books: createBookHandlers(new BookReadingApplication({
          activeReadings,
          notes,
          operations: shelfOperations,
          readingFiles: shelfReadingFiles,
          storage,
        })),
        configuration: createConfigurationHandlers(configuration),
        journals: createJournalHandlers(notes),
        learning: createLearningHandlers(
          learning,
          createLearningReviewApplication(notes, learning, now),
          now,
        ),
        notes: createNoteHandlers(notes),
        shelf: createShelfHandlers(
          shelfStorage,
          shelfImageCache,
          shelfReadingFiles,
          activeReadings,
          shelfOperations,
        ),
        window: createWindowHandlers(),
      }, { host: ipcMain as unknown as IpcHandlerHost }),
      close: current => current.close(),
      name: 'IPC registry',
    })
    scope.commit()
    return { close: scope.close }
  }
  catch (error) {
    return scope.rollback(error)
  }
}
export type { RuntimeInfo } from './app-service'
