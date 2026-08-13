import type { ConfigurationStore } from '@memorilo/config'
import type { DesktopConfiguration } from '@memorilo/desktop-config'
import type { DesktopIpcHandlers } from './ipc-handler-registry'

export function createConfigurationHandlers(
  store: ConfigurationStore<DesktopConfiguration>,
): DesktopIpcHandlers['configuration'] {
  return {
    get(): DesktopConfiguration {
      return store.getSnapshot()
    },
    set(configuration: DesktopConfiguration): Promise<DesktopConfiguration> {
      return store.set(configuration)
    },
    setValue(path: string, value: unknown): Promise<DesktopConfiguration> {
      return store.setValue(path, value)
    },
  }
}
