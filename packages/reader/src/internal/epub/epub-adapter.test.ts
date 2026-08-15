import type { Deferred } from '@memorilo/effect-lifecycle/testing'
import type { ReaderAdapterCallbacks } from '../reader-adapter'
import type { ParsedEpub } from './epub-parser'
import { deferred } from '@memorilo/effect-lifecycle/testing'
import { Locator, LocatorLocations } from '@readium/shared'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { openEpubAdapter } from './epub-adapter'
import { EpubReaderSurface } from './epub-reader-surface'

const harness = vi.hoisted(() => {
  const state = {
    archiveClose: vi.fn(),
    continuousMount: undefined as unknown as {
      activate: ReturnType<typeof vi.fn>
      clearSelection: ReturnType<typeof vi.fn>
      close: ReturnType<typeof vi.fn>
      goBackward: ReturnType<typeof vi.fn>
      goForward: ReturnType<typeof vi.fn>
      goToAnnotation: ReturnType<typeof vi.fn>
      goToOutlineItem: ReturnType<typeof vi.fn>
      moveViewport: ReturnType<typeof vi.fn>
      positionAt: ReturnType<typeof vi.fn>
      ready: Promise<void>
      setAnnotations: ReturnType<typeof vi.fn>
      setRegionSelectionEnabled: ReturnType<typeof vi.fn>
      setScale: ReturnType<typeof vi.fn>
    },
    continuousOpen: vi.fn(),
    destroyFailures: [] as unknown[],
    forwardCallback: undefined as (() => void) | undefined,
    instances: [] as Array<{
      currentLocator: Locator
      destroy: ReturnType<typeof vi.fn>
      goForward: ReturnType<typeof vi.fn>
      listener: {
        frameLoaded: (frameWindow: Window) => void
        positionChanged: (locator: Locator) => void
      }
      load: ReturnType<typeof vi.fn>
      submitPreferences: ReturnType<typeof vi.fn>
    }>,
    load: undefined as unknown as Deferred<void>,
    listener: undefined as undefined | { frameLoaded: (frameWindow: Window) => void },
    parseEpub: vi.fn(),
    preferences: undefined as unknown as Deferred<void>,
    resizeObserverConstructionFailure: undefined as unknown,
    resizeObservers: [] as Array<{
      disconnect: ReturnType<typeof vi.fn>
      observe: ReturnType<typeof vi.fn>
    }>,
    surfaceElements: [] as ReturnType<typeof fakeElement>[],
    reset() {
      state.archiveClose.mockReset()
      state.archiveClose.mockResolvedValue(undefined)
      state.destroyFailures.length = 0
      state.forwardCallback = undefined
      state.instances.length = 0
      state.listener = undefined
      state.parseEpub.mockReset()
      state.resizeObserverConstructionFailure = undefined
      state.resizeObservers.length = 0
      state.surfaceElements.length = 0
      state.continuousMount = {
        activate: vi.fn(),
        clearSelection: vi.fn(),
        close: vi.fn(async () => undefined),
        goBackward: vi.fn(async () => undefined),
        goForward: vi.fn(async () => undefined),
        goToAnnotation: vi.fn(async () => undefined),
        goToOutlineItem: vi.fn(async () => undefined),
        moveViewport: vi.fn(() => 'at-boundary'),
        positionAt: vi.fn(),
        ready: Promise.resolve(),
        setAnnotations: vi.fn(),
        setRegionSelectionEnabled: vi.fn(),
        setScale: vi.fn(async () => undefined),
      }
      state.continuousOpen.mockReset()
      state.continuousOpen.mockReturnValue(state.continuousMount)
    },
  }
  return state
})

vi.mock('@readium/navigator', () => {
  class FakeEpubNavigator {
    readonly applyDecorations = vi.fn()
    readonly canGoBackward = false
    readonly canGoForward = true
    currentLocator: Locator
    readonly destroy = vi.fn(async () => {
      harness.load.resolve()
      harness.preferences.resolve()
      const failure = harness.destroyFailures.shift()
      if (failure !== undefined)
        throw failure
    })

    readonly goForward = vi.fn((_animated: boolean, callback: () => void) => {
      harness.forwardCallback = callback
    })

    readonly load = vi.fn(() => harness.load.promise)

    readonly listener: {
      frameLoaded: (frameWindow: Window) => void
      positionChanged: (locator: Locator) => void
    }

    readonly registerDecorationObserver = vi.fn()
    readonly submitPreferences = vi.fn(() => harness.preferences.promise)
    readonly unregisterDecorationObserver = vi.fn()
    readonly viewport = {
      progressions: new Map(),
      readingOrder: [] as string[],
    }

    constructor(
      _container: HTMLElement,
      _publication: unknown,
      listener: { frameLoaded: (frameWindow: Window) => void },
      _positions: readonly Locator[],
      initialLocator: Locator,
    ) {
      this.currentLocator = initialLocator
      this.listener = listener as typeof this.listener
      harness.listener = listener
      harness.instances.push(this)
    }
  }

  return {
    DecorationStyleType: {
      Highlight: 'highlight',
      HighlightUnderline: 'highlight-underline',
    },
    EpubNavigator: FakeEpubNavigator,
    EpubPreferences: class FakeEpubPreferences {
      constructor(_preferences: unknown) {}
    },
  }
})

vi.mock('./epub-parser', () => ({ parseEpub: harness.parseEpub }))
vi.mock('./epub-continuous-reader-mount', () => ({
  EpubContinuousReaderMount: { open: harness.continuousOpen },
}))
vi.mock('../region-selection.stylex', () => ({
  regionSelectionClassNames: {
    annotation: 'annotation',
    annotations: 'annotations',
    capture: 'capture',
    captureActive: 'capture-active',
    draft: 'draft',
  },
}))

function fakeElement(): HTMLElement {
  return {
    addEventListener: vi.fn(),
    append: vi.fn(),
    className: '',
    getBoundingClientRect: vi.fn(() => ({
      bottom: 100,
      height: 100,
      left: 0,
      right: 100,
      top: 0,
      width: 100,
      x: 0,
      y: 0,
    })),
    querySelectorAll: vi.fn(() => []),
    remove: vi.fn(),
    removeEventListener: vi.fn(),
    replaceChildren: vi.fn(),
    setAttribute: vi.fn(),
    style: {},
  } as unknown as HTMLElement
}

function callbacks(): ReaderAdapterCallbacks {
  return {
    onAnnotationActivate: vi.fn(),
    onError: vi.fn(),
    onKeyDown: vi.fn(() => false),
    onOcrStatusChange: vi.fn(),
    onRegionSelectionModeChange: vi.fn(),
    onSelectionChange: vi.fn(),
    onStateChange: vi.fn(),
    regionAnnotationLabel: () => 'Open annotation',
  }
}

function parsedEpub(): ParsedEpub {
  const locator = new Locator({
    href: 'chapter.xhtml',
    locations: new LocatorLocations({ progression: 0 }),
    type: 'application/xhtml+xml',
  })
  return {
    archive: { close: harness.archiveClose },
    layout: 'reflowable',
    positions: [locator],
    publication: {
      readingOrder: { items: [{ href: locator.href }] },
    },
    title: 'Book',
  } as unknown as ParsedEpub
}

beforeEach(() => {
  harness.reset()
  harness.load = deferred()
  harness.preferences = deferred()
  vi.stubGlobal('document', { createElement: vi.fn(() => {
    const element = fakeElement()
    harness.surfaceElements.push(element)
    return element
  }) })
  vi.stubGlobal('ResizeObserver', class FakeResizeObserver {
    readonly disconnect = vi.fn()
    readonly observe = vi.fn()

    constructor() {
      if (harness.resizeObserverConstructionFailure)
        throw harness.resizeObserverConstructionFailure
      harness.resizeObservers.push(this)
    }
  })
  harness.parseEpub.mockResolvedValue(parsedEpub())
})

afterEach(() => {
  vi.unstubAllGlobals()
})

async function openAdapter(readerCallbacks = callbacks()) {
  return openEpubAdapter({
    byteLength: 1,
    format: 'epub',
    name: 'book.epub',
    read: vi.fn(async () => new Uint8Array([0])),
  }, 'reader', 'single-page', null, readerCallbacks)
}

async function openMountedAdapter() {
  const adapter = await openAdapter()
  const container = fakeElement()
  const mounting = adapter.mount(container)
  await vi.waitFor(() => expect(harness.instances).toHaveLength(1))
  const navigator = harness.instances[0]!
  await vi.waitFor(() => expect(navigator.load).toHaveBeenCalledOnce())
  harness.load.resolve()
  await mounting
  return { adapter, container, navigator }
}

async function closesBeforeRelease(
  closing: Promise<void>,
  release: () => void,
): Promise<boolean> {
  const closed = await Promise.race([
    closing.then(() => true),
    new Promise<false>(resolve => setTimeout(() => resolve(false), 50)),
  ])
  if (!closed)
    release()
  await closing
  return closed
}

describe('epub adapter lifecycle', () => {
  it('uses the continuous spine mount and restores the locator', async () => {
    const readerCallbacks = callbacks()
    const parsed = parsedEpub()
    harness.parseEpub.mockResolvedValueOnce(parsed)
    const adapter = await openEpubAdapter({
      byteLength: 1,
      format: 'epub',
      name: 'book.epub',
      read: vi.fn(async () => new Uint8Array([0])),
    }, 'reader', 'continuous', null, readerCallbacks)
    const container = fakeElement()

    await adapter.mount(container)

    expect(harness.continuousOpen).toHaveBeenCalledWith(expect.objectContaining({
      container,
      initialLocator: parsed.positions[0],
      pageMode: 'continuous',
    }))
    expect(harness.continuousMount.activate).toHaveBeenCalledOnce()
    await adapter.destroy()
  })

  it('rejects an overlapping mount before it can queue behind the first mount', async () => {
    const adapter = await openAdapter()
    const mounting = adapter.mount(fakeElement())
    await vi.waitFor(() => expect(harness.instances).toHaveLength(1))
    await vi.waitFor(() => expect(harness.instances[0]!.load).toHaveBeenCalledOnce())

    await expect(adapter.mount(fakeElement())).rejects.toThrow('EPUB reader is already mounted')

    const closing = adapter.destroy()
    harness.load.resolve()
    await closing
    await Promise.allSettled([mounting])
  })

  it('waits for an unresponsive mount before destroying the navigator', async () => {
    const adapter = await openAdapter()
    const mounting = adapter.mount(fakeElement())
    await vi.waitFor(() => expect(harness.instances).toHaveLength(1))
    const navigator = harness.instances[0]!
    await vi.waitFor(() => expect(navigator.load).toHaveBeenCalledOnce())

    const closing = adapter.destroy()
    const closedBeforeLoad = await closesBeforeRelease(closing, harness.load.resolve)
    await Promise.allSettled([mounting])

    expect(closedBeforeLoad).toBe(false)
    expect(navigator.destroy).toHaveBeenCalledOnce()
  })

  it('waits for a missing navigation callback before destroying the navigator', async () => {
    const { adapter, navigator } = await openMountedAdapter()
    const navigating = adapter.goForward('start')
    await vi.waitFor(() => expect(navigator.goForward).toHaveBeenCalledOnce())

    const closedBeforeCallback = await closesBeforeRelease(
      adapter.destroy(),
      () => harness.forwardCallback?.(),
    )
    await Promise.allSettled([navigating])

    expect(closedBeforeCallback).toBe(false)
    expect(navigator.destroy).toHaveBeenCalledOnce()
  })

  it('waits for preferences to settle before destroying the navigator', async () => {
    const { adapter, navigator } = await openMountedAdapter()
    const scaling = adapter.setScale!(1.2)
    await vi.waitFor(() => expect(navigator.submitPreferences).toHaveBeenCalledOnce())

    const closedBeforePreferences = await closesBeforeRelease(
      adapter.destroy(),
      harness.preferences.resolve,
    )
    await Promise.allSettled([scaling])

    expect(closedBeforePreferences).toBe(false)
    expect(navigator.destroy).toHaveBeenCalledOnce()
  })

  it('removes listeners from dynamically loaded frames during destroy', async () => {
    const { adapter } = await openMountedAdapter()
    const frameDocument = {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    } as unknown as Document

    harness.listener?.frameLoaded({ document: frameDocument } as unknown as Window)
    expect(frameDocument.addEventListener).toHaveBeenCalledOnce()

    await adapter.destroy()

    expect(frameDocument.removeEventListener).toHaveBeenCalledOnce()
  })

  it('keeps navigator dependencies alive until a failed destroy can be retried', async () => {
    const destroyError = new Error('navigator frame is still unloading')
    harness.destroyFailures.push(destroyError)
    const { adapter, navigator } = await openMountedAdapter()

    await expect(adapter.destroy()).rejects.toEqual(
      new Error('Failed to close reader mount', {
        cause: new Error('Failed to close navigator', { cause: destroyError }),
      }),
    )

    expect(harness.surfaceElements[0]!.remove).not.toHaveBeenCalled()
    expect(harness.archiveClose).not.toHaveBeenCalled()

    await expect(adapter.destroy()).resolves.toBeUndefined()
    expect(navigator.destroy).toHaveBeenCalledTimes(2)
    expect(harness.surfaceElements[0]!.remove).toHaveBeenCalledOnce()
    expect(harness.archiveClose).toHaveBeenCalledOnce()
  })

  it('rolls back a failed mount and allows a clean retry', async () => {
    const loadFailure = new Error('spine load failed')
    const adapter = await openAdapter()
    const failedContainer = fakeElement()
    const failedMount = adapter.mount(failedContainer)
    await vi.waitFor(() => expect(harness.instances).toHaveLength(1))
    const failedNavigator = harness.instances[0]!
    await vi.waitFor(() => expect(failedNavigator.load).toHaveBeenCalledOnce())

    harness.load.reject(loadFailure)
    await expect(failedMount).rejects.toBe(loadFailure)
    expect(failedNavigator.destroy).toHaveBeenCalledOnce()
    expect(harness.surfaceElements[0]!.remove).toHaveBeenCalledOnce()

    harness.load = deferred()
    const retryContainer = fakeElement()
    const retryMount = adapter.mount(retryContainer)
    await vi.waitFor(() => expect(harness.instances).toHaveLength(2))
    const retryNavigator = harness.instances[1]!
    harness.load.resolve()

    await expect(retryMount).resolves.toBeUndefined()
    await adapter.destroy()
    expect(retryNavigator.destroy).toHaveBeenCalledOnce()
    expect(harness.surfaceElements[3]!.remove).toHaveBeenCalledOnce()
  })

  it('rolls back surface resources when construction fails before ownership registration', async () => {
    const constructionFailure = new Error('resize observer construction failed')
    harness.resizeObserverConstructionFailure = constructionFailure
    const adapter = await openAdapter()

    await expect(adapter.mount(fakeElement())).rejects.toBe(constructionFailure)

    const [surface, annotationLayer, regionCapture] = harness.surfaceElements
    expect(surface!.remove).toHaveBeenCalledOnce()
    expect(annotationLayer!.removeEventListener).toHaveBeenCalledWith('click', expect.any(Function))
    expect(regionCapture!.removeEventListener).toHaveBeenCalledTimes(4)
    await adapter.destroy()
  })

  it('continues surface cleanup after a failure and retries only the failed disposer', async () => {
    const { adapter } = await openMountedAdapter()
    const disconnectFailure = new Error('resize observer disconnect failed')
    const observer = harness.resizeObservers[0]!
    observer.disconnect.mockImplementationOnce(() => {
      throw disconnectFailure
    })
    const surface = harness.surfaceElements[0]!

    await expect(adapter.destroy()).rejects.toEqual(new Error('Failed to close reader mount', {
      cause: new Error('Failed to close reader surface', { cause: disconnectFailure }),
    }))

    expect(observer.disconnect).toHaveBeenCalledOnce()
    expect(surface.remove).toHaveBeenCalledOnce()
    expect(harness.archiveClose).not.toHaveBeenCalled()

    await expect(adapter.destroy()).resolves.toBeUndefined()
    expect(observer.disconnect).toHaveBeenCalledTimes(2)
    expect(surface.remove).toHaveBeenCalledOnce()
    expect(harness.archiveClose).toHaveBeenCalledOnce()
  })

  it('aggregates independent surface cleanup failures and retries each failed disposer', () => {
    const surface = new EpubReaderSurface({
      container: fakeElement(),
      onAnnotationActivate: vi.fn(),
      onRegionSelection: vi.fn(),
      onRegionSelectionModeChange: vi.fn(),
      onResize: vi.fn(),
      title: 'Book',
    })
    const disconnectFailure = new Error('resize observer disconnect failed')
    const listenerFailure = new Error('annotation listener removal failed')
    const observer = harness.resizeObservers[0]!
    const annotationLayer = harness.surfaceElements[1]!
    const surfaceElement = harness.surfaceElements[0]!
    observer.disconnect.mockImplementationOnce(() => {
      throw disconnectFailure
    })
    vi.mocked(annotationLayer.removeEventListener).mockImplementationOnce(() => {
      throw listenerFailure
    })

    expect(() => surface.close()).toThrow(expect.objectContaining({
      errors: [disconnectFailure, listenerFailure],
      message: 'Failed to close EPUB reader surface',
    }))
    expect(surfaceElement.remove).toHaveBeenCalledOnce()

    expect(() => surface.close()).not.toThrow()
    expect(observer.disconnect).toHaveBeenCalledTimes(2)
    expect(annotationLayer.removeEventListener).toHaveBeenCalledTimes(2)
    expect(surfaceElement.remove).toHaveBeenCalledOnce()
  })

  it('ignores callbacks from a failed mount after retrying', async () => {
    const readerCallbacks = callbacks()
    const adapter = await openAdapter(readerCallbacks)
    const failedMount = adapter.mount(fakeElement())
    await vi.waitFor(() => expect(harness.instances).toHaveLength(1))
    const failedNavigator = harness.instances[0]!
    harness.load.reject(new Error('spine load failed'))
    await expect(failedMount).rejects.toThrow('spine load failed')

    harness.load = deferred()
    const retryMount = adapter.mount(fakeElement())
    await vi.waitFor(() => expect(harness.instances).toHaveLength(2))
    const retryNavigator = harness.instances[1]!
    harness.load.resolve()
    await retryMount
    expect(readerCallbacks.onStateChange).toHaveBeenCalledOnce()

    failedNavigator.listener.positionChanged(new Locator({
      href: 'stale.xhtml',
      locations: new LocatorLocations({ progression: 0.5 }),
      type: 'application/xhtml+xml',
    }))

    expect(readerCallbacks.onError).not.toHaveBeenCalled()
    expect(readerCallbacks.onStateChange).toHaveBeenCalledOnce()
    expect(retryNavigator.currentLocator.href).toBe('chapter.xhtml')
    await adapter.destroy()
  })

  it('reports invalid locators and deduplicates repeated state callbacks', async () => {
    const readerCallbacks = callbacks()
    const adapter = await openAdapter(readerCallbacks)
    const mounting = adapter.mount(fakeElement())
    await vi.waitFor(() => expect(harness.instances).toHaveLength(1))
    const navigator = harness.instances[0]!
    harness.load.resolve()
    await mounting
    expect(readerCallbacks.onStateChange).toHaveBeenCalledOnce()

    navigator.listener.positionChanged(navigator.currentLocator)
    expect(readerCallbacks.onStateChange).toHaveBeenCalledOnce()

    navigator.listener.positionChanged(new Locator({
      href: 'outside.xhtml',
      locations: new LocatorLocations({ progression: 0.25 }),
      type: 'application/xhtml+xml',
    }))

    expect(readerCallbacks.onError).toHaveBeenCalledOnce()
    expect(readerCallbacks.onError).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'EPUB locator outside.xhtml is outside the publication reading order',
      }),
    )
    expect(readerCallbacks.onStateChange).toHaveBeenCalledOnce()
    await adapter.destroy()
  })

  it('preserves construction and archive cleanup failures together', async () => {
    const invalid = parsedEpub()
    invalid.positions = []
    const cleanupError = new Error('archive close failed')
    harness.archiveClose.mockRejectedValueOnce(cleanupError)
    harness.parseEpub.mockResolvedValueOnce(invalid)

    const error = await openAdapter().catch(cause => cause)

    expect(error).toBeInstanceOf(AggregateError)
    expect((error as AggregateError).message).toBe('Failed to construct and close EPUB reader')
    expect((error as AggregateError).errors).toEqual([
      expect.objectContaining({ message: 'EPUB does not contain a readable spine position' }),
      cleanupError,
    ])
  })
})
