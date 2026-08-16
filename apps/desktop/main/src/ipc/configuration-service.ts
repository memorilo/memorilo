import type { ConfigurationStore } from '@memorilo/config'
import type { ConfigurationRouteHandlers } from '@memorilo/desktop-api'
import type { DesktopConfiguration } from '@memorilo/desktop-config'

export function createConfigurationHandlers(
  store: ConfigurationStore<DesktopConfiguration>,
): ConfigurationRouteHandlers {
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
