import type { ConfigurationStore } from '@memorilo/config'
import type { DesktopConfiguration } from '@memorilo/desktop-config'
import type { EditorStorage } from '@memorilo/editor-storage'
import type { MergeIpcService } from 'electron-ipc-decorator'
import type { NoteApplicationService } from '../notes/note-application-service'
import { createServices } from 'electron-ipc-decorator'

import { AppService } from './app-service'
import { createAssetService } from './asset-service'
import { createConfigurationService } from './configuration-service'
import { createNoteService } from './note-service'
import { WindowService } from './window-service'

export function createDesktopServices(
  notes: NoteApplicationService,
  storage: EditorStorage,
  configuration: ConfigurationStore<DesktopConfiguration>,
  assetDirectory: string | null,
  serializeAssetOperation: <Result>(operation: () => Promise<Result>) => Promise<Result>,
) {
  const AssetService = createAssetService(assetDirectory, storage, configuration, serializeAssetOperation)
  const ConfigurationService = createConfigurationService(configuration)
  const NoteService = createNoteService(notes)
  return createServices([AppService, AssetService, ConfigurationService, NoteService, WindowService] as const)
}

export type IpcServices = MergeIpcService<ReturnType<typeof createDesktopServices>>
export type { RuntimeInfo } from './app-service'
