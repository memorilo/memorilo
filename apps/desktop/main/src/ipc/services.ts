import type { ConfigurationStore } from '@memorilo/config'
import type { DesktopConfiguration } from '@memorilo/desktop-config'
import type { EditorStorage } from '@memorilo/editor-storage'
import type { MergeIpcService } from 'electron-ipc-decorator'
import { createServices } from 'electron-ipc-decorator'

import { AppService } from './app-service'
import { createConfigurationService } from './configuration-service'
import { createNoteService } from './note-service'
import { WindowService } from './window-service'

export function createDesktopServices(
  storage: EditorStorage,
  configuration: ConfigurationStore<DesktopConfiguration>,
) {
  const ConfigurationService = createConfigurationService(configuration)
  const NoteService = createNoteService(storage)
  return createServices([AppService, ConfigurationService, NoteService, WindowService] as const)
}

export type IpcServices = MergeIpcService<ReturnType<typeof createDesktopServices>>
export type { RuntimeInfo } from './app-service'
