import type { ConfigurationStore } from '@memorilo/config'
import type { DesktopConfiguration } from '@memorilo/desktop-config'
import type { MergeIpcService } from 'electron-ipc-decorator'
import type { NoteApplicationService } from '../notes/note-application-service'
import { createServices } from 'electron-ipc-decorator'

import { AppService } from './app-service'
import { createConfigurationService } from './configuration-service'
import { createNoteService } from './note-service'
import { WindowService } from './window-service'

export function createDesktopServices(
  notes: NoteApplicationService,
  configuration: ConfigurationStore<DesktopConfiguration>,
) {
  const ConfigurationService = createConfigurationService(configuration)
  const NoteService = createNoteService(notes)
  return createServices([AppService, ConfigurationService, NoteService, WindowService] as const)
}

export type IpcServices = MergeIpcService<ReturnType<typeof createDesktopServices>>
export type { RuntimeInfo } from './app-service'
