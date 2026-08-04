import type { ConfigurationAdapter, ConfigurationStore } from '@memorilo/config'
import type { DesktopConfiguration } from '@memorilo/desktop-config'
import { createConfigurationStore } from '@memorilo/config'
import { desktopConfigurationDefinition } from '@memorilo/desktop-config'

function desktopConfigurationAdapter(): ConfigurationAdapter {
  return {
    read: () => window.desktop.getConfiguration(),
    subscribe: listener => window.desktop.subscribeConfiguration(() => listener()),
    write: async (configuration) => {
      await window.desktop.setConfiguration(configuration as DesktopConfiguration)
    },
  }
}

export function createRendererConfigurationStore(): Promise<ConfigurationStore<DesktopConfiguration>> {
  return createConfigurationStore(desktopConfigurationDefinition, desktopConfigurationAdapter(), {
    persistDefaults: false,
  })
}
