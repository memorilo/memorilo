import type { ConfigurationStore } from '@memorilo/config'
import type { DesktopConfiguration } from '@memorilo/desktop-config'
import { IpcMethod, IpcService } from 'electron-ipc-decorator'

export function createConfigurationService(store: ConfigurationStore<DesktopConfiguration>) {
  class ConfigurationService extends IpcService {
    static override readonly groupName = 'configuration'

    @IpcMethod()
    get(): DesktopConfiguration {
      return store.getSnapshot()
    }

    @IpcMethod()
    set(configuration: DesktopConfiguration): Promise<DesktopConfiguration> {
      return store.set(configuration)
    }
  }

  return ConfigurationService
}
