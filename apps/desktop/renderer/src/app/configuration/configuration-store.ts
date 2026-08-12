import type { ConfigurationAdapter, ConfigurationStore } from '@memorilo/config'
import type { DesktopConfiguration } from '@memorilo/desktop-config'
import { createConfigurationStore } from '@memorilo/config'
import { desktopConfigurationDefinition } from '@memorilo/desktop-config'

class BrowserPreviewConfigurationAdapter implements ConfigurationAdapter {
  private value: DesktopConfiguration = desktopConfigurationDefinition.defaults

  async read(): Promise<DesktopConfiguration> {
    return structuredClone(this.value)
  }

  async write(configuration: unknown): Promise<void> {
    this.value = configuration as DesktopConfiguration
  }
}

function desktopConfigurationAdapter(): ConfigurationAdapter {
  const desktop = window.desktop
  return {
    read: () => desktop.getConfiguration(),
    setValue: (path, value) => desktop.setConfigurationValue(path, value),
    subscribe: listener => desktop.subscribeConfiguration(() => listener({ type: 'changed' })),
    write: async (configuration) => {
      await desktop.setConfiguration(configuration as DesktopConfiguration)
    },
  }
}

export function createRendererConfigurationStore(): Promise<ConfigurationStore<DesktopConfiguration>> {
  const adapter = typeof window.desktop === 'undefined'
    ? new BrowserPreviewConfigurationAdapter()
    : desktopConfigurationAdapter()
  return createConfigurationStore(desktopConfigurationDefinition, adapter, { persistDefaults: false })
}
