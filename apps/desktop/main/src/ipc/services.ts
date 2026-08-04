import type { ConfigurationStore } from '@memorilo/config'
import type { DesktopConfiguration } from '@memorilo/desktop-config'
import type { EditorStorage } from '@memorilo/editor-storage'
import type { MergeIpcService } from 'electron-ipc-decorator'
import { createServices } from 'electron-ipc-decorator'

import { AppService } from './app-service'
import { createAssetService } from './asset-service'
import { createConfigurationService } from './configuration-service'
import { createNoteService } from './note-service'
import { WindowService } from './window-service'

export function createDesktopServices(
  storage: EditorStorage,
  configuration: ConfigurationStore<DesktopConfiguration>,
  assetDirectory: string | null,
) {
  let assetOperations = Promise.resolve()
  const serializeAssetOperation = <Result>(operation: () => Promise<Result>): Promise<Result> => {
    const result = assetOperations.then(operation)
    assetOperations = result.then(() => undefined, () => undefined)
    return result
  }
  const AssetService = createAssetService(assetDirectory, storage, configuration, serializeAssetOperation)
  const ConfigurationService = createConfigurationService(configuration)
  const NoteService = createNoteService(storage, serializeAssetOperation)
  return createServices([AppService, AssetService, ConfigurationService, NoteService, WindowService] as const)
}

export type IpcServices = MergeIpcService<ReturnType<typeof createDesktopServices>>
export type { RuntimeInfo } from './app-service'
