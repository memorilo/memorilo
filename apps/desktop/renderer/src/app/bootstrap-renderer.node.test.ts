import type { ConfigurationStore } from '@memorilo/config'
import type { DesktopConfiguration } from '@memorilo/desktop-config'
import { desktopConfigurationDefinition } from '@memorilo/desktop-config'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { bootstrapRenderer } from './bootstrap-renderer'

const mocks = vi.hoisted(() => ({
  createStore: vi.fn(),
  initI18n: vi.fn(),
}))

vi.mock('../i18n', () => ({ resolveConfigLanguage: () => 'en' }))
vi.mock('../i18n/init', () => ({ initI18n: mocks.initI18n }))
vi.mock('./configuration/configuration-store', () => ({
  createRendererConfigurationStore: mocks.createStore,
}))

function configurationStore(close = vi.fn(async () => undefined)) {
  const snapshot = structuredClone(desktopConfigurationDefinition.defaults)
  return {
    close,
    getSnapshot: () => snapshot,
    refresh: async () => snapshot,
    set: async () => snapshot,
    setValue: async () => snapshot,
    subscribe: () => () => undefined,
  } satisfies ConfigurationStore<DesktopConfiguration>
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('window', new EventTarget())
  mocks.initI18n.mockResolvedValue(undefined)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('renderer bootstrap lifecycle', () => {
  it('awaits asynchronous mounting and rolls back the configuration store when it fails', async () => {
    const mountFailure = new Error('mount failed')
    const store = configurationStore()
    const renderError = vi.fn()
    mocks.createStore.mockResolvedValue(store)

    await bootstrapRenderer(async () => {
      await Promise.resolve()
      throw mountFailure
    }, renderError)

    expect(store.close).toHaveBeenCalledOnce()
    expect(renderError).toHaveBeenCalledWith(mountFailure)
  })

  it('attempts the store close when the renderer disposer fails during unload', async () => {
    const disposeFailure = new Error('dispose failed')
    const dispose = vi.fn(async () => {
      throw disposeFailure
    })
    const store = configurationStore()
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    mocks.createStore.mockResolvedValue(store)

    await bootstrapRenderer(async () => dispose, vi.fn())
    window.dispatchEvent(new Event('beforeunload'))

    await vi.waitFor(() => expect(store.close).toHaveBeenCalledOnce())
    expect(dispose).toHaveBeenCalledOnce()
    expect(consoleError).toHaveBeenCalledWith(
      'Failed to close renderer resources',
      disposeFailure,
    )
  })
})
