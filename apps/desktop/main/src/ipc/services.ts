import type { EditorStorage } from '@memorilo/editor-storage'
import type { MergeIpcService } from 'electron-ipc-decorator'
import { createServices } from 'electron-ipc-decorator'

import { AppService } from './app-service'
import { createDocumentService } from './document-service'

export function createDesktopServices(storage: EditorStorage) {
  const DocumentService = createDocumentService(storage)
  return createServices([AppService, DocumentService] as const)
}

export type IpcServices = MergeIpcService<ReturnType<typeof createDesktopServices>>
export type { RuntimeInfo } from './app-service'
