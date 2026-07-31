import type { EditorStorage } from '@memorilo/editor-storage'
import type { ShelfImageCache, ShelfStorage } from '@memorilo/shelf'
import type { MergeIpcService } from 'electron-ipc-decorator'
import { createServices } from 'electron-ipc-decorator'

import { AppService } from './app-service'
import { createNoteService } from './note-service'
import { createShelfService } from './shelf-service'

export function createDesktopServices(
  storage: EditorStorage,
  shelfStorage: ShelfStorage,
  shelfImageCache: ShelfImageCache,
) {
  const NoteService = createNoteService(storage)
  const ShelfService = createShelfService(shelfStorage, shelfImageCache)
  return createServices([AppService, NoteService, ShelfService] as const)
}

export type IpcServices = MergeIpcService<ReturnType<typeof createDesktopServices>>
export type { RuntimeInfo } from './app-service'
