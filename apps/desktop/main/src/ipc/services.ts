import type { ConfigurationStore } from '@memorilo/config'
import type { DesktopConfiguration } from '@memorilo/desktop-config'
import type { EditorStorage } from '@memorilo/editor-storage'
import type { ShelfImageCache, ShelfStorage } from '@memorilo/shelf'
import type { ShelfReadingFileStore } from '@memorilo/shelf/node'
import type { MergeIpcService } from 'electron-ipc-decorator'
import type { NoteApplicationService } from '../notes/note-application-service'
import type { ActiveReadingRegistry } from '../reading/active-reading-registry'
import { createServices } from 'electron-ipc-decorator'

import { AppService } from './app-service'
import { createAssetService } from './asset-service'
import { createBookService } from './book-service'
import { createConfigurationService } from './configuration-service'
import { createNoteService } from './note-service'
import { createShelfService } from './shelf-service'
import { WindowService } from './window-service'

export function createDesktopServices(
  notes: NoteApplicationService,
  storage: EditorStorage,
  shelfStorage: ShelfStorage,
  shelfImageCache: ShelfImageCache,
  shelfReadingFiles: ShelfReadingFileStore,
  configuration: ConfigurationStore<DesktopConfiguration>,
  assetDirectory: string | null,
  serializeAssetOperation: <Result>(operation: () => Promise<Result>) => Promise<Result>,
  activeReadings: ActiveReadingRegistry,
) {
  const AssetService = createAssetService(assetDirectory, storage, configuration, serializeAssetOperation)
  const ConfigurationService = createConfigurationService(configuration)
  const BookService = createBookService(notes, storage, shelfReadingFiles, activeReadings)
  const NoteService = createNoteService(notes)
  const ShelfService = createShelfService(shelfStorage, shelfImageCache, shelfReadingFiles, activeReadings)
  return createServices([AppService, AssetService, BookService, ConfigurationService, NoteService, ShelfService, WindowService] as const)
}

export type IpcServices = MergeIpcService<ReturnType<typeof createDesktopServices>>
export type { RuntimeInfo } from './app-service'
