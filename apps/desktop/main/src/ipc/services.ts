import type { ConfigurationStore } from '@memorilo/config'
import type { DesktopConfiguration } from '@memorilo/desktop-config'
import type { EditorStorage } from '@memorilo/editor-storage'
import type { ShelfImageCache, ShelfStorage } from '@memorilo/shelf'
import type { ShelfReadingFileStore } from '@memorilo/shelf/node'
import type { MergeIpcService } from 'electron-ipc-decorator'
import { createServices } from 'electron-ipc-decorator'

import { AppService } from './app-service'
import { createConfigurationService } from './configuration-service'
import { createNoteService } from './note-service'
import { createShelfService } from './shelf-service'

export function createDesktopServices(
  storage: EditorStorage,
  shelfStorage: ShelfStorage,
  shelfImageCache: ShelfImageCache,
  shelfReadingFiles: ShelfReadingFileStore,
  configuration: ConfigurationStore<DesktopConfiguration>,
) {
  const ConfigurationService = createConfigurationService(configuration)
  const NoteService = createNoteService(storage)
  const ShelfService = createShelfService(shelfStorage, shelfImageCache, shelfReadingFiles)
  return createServices([AppService, ConfigurationService, NoteService, ShelfService] as const)
}

export type IpcServices = MergeIpcService<ReturnType<typeof createDesktopServices>>
export type { RuntimeInfo } from './app-service'
