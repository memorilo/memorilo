import type { ConfigurationStore } from '@memorilo/config'
import type { DesktopConfiguration } from '@memorilo/desktop-config'
import {
  combineLifecycleFailures,
  runLifecycleOperations,
} from '@memorilo/effect-lifecycle'
import { resolveConfigLanguage } from '../i18n'
import { initI18n } from '../i18n/init'
import { createRendererConfigurationStore } from './configuration/configuration-store'

export type RendererDisposer = () => Promise<void> | void
export type RendererMount = (
  store: ConfigurationStore<DesktopConfiguration>,
) => Promise<RendererDisposer | void> | RendererDisposer | void

export async function bootstrapRenderer(
  render: RendererMount,
  renderError: (error: unknown) => void,
): Promise<void> {
  let store: ConfigurationStore<DesktopConfiguration> | undefined
  try {
    store = await createRendererConfigurationStore()
    await initI18n(resolveConfigLanguage(store.getSnapshot().language))
    const activeStore = store
    const dispose = await render(activeStore)
    window.addEventListener('beforeunload', () => {
      void runLifecycleOperations(
        [
          () => dispose?.(),
          () => activeStore.close(),
        ],
        'Renderer shutdown failed',
        'sequential',
      ).catch(error => console.error('Failed to close renderer resources', error))
    }, { once: true })
  }
  catch (error) {
    if (store) {
      try {
        await store.close()
      }
      catch (closeError) {
        renderError(combineLifecycleFailures(
          [error, closeError],
          'Renderer initialization and cleanup failed',
        ))
        return
      }
    }
    renderError(error)
  }
}
