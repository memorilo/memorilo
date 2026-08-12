import type { ReaderAdapterCallbacks } from '../reader-adapter'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { openTxtAdapter } from './txt-adapter'

const harness = vi.hoisted(() => ({
  annotationClose: vi.fn(),
  createProjection: vi.fn(),
  projection: {
    captureSelection: vi.fn(),
    currentOffset: vi.fn(() => 0),
    refreshRegionAnnotations: vi.fn(),
    regionSelection: vi.fn(),
    restoreOffset: vi.fn(),
    setAnnotations: vi.fn(),
  },
  regionDestroy: vi.fn(),
  regionMount: vi.fn(),
  regionSetEnabled: vi.fn(),
}))

vi.mock('../annotations', () => ({
  AnnotationActivationOwner: class {
    close(): void {
      harness.annotationClose()
    }
  },
}))
vi.mock('../region-selection', () => ({
  RegionSelectionController: class {
    destroy(): void {
      harness.regionDestroy()
    }

    mount(surface: HTMLElement, capture: HTMLElement): void {
      harness.regionMount(surface, capture)
    }

    setEnabled(enabled: boolean): void {
      harness.regionSetEnabled(enabled)
    }
  },
}))
vi.mock('../region-selection.stylex', () => ({
  regionSelectionClassNames: { annotations: 'annotations' },
}))
vi.mock('./txt-document-projection', () => ({
  createTxtDocumentProjection: harness.createProjection,
}))

interface FakeElement extends HTMLElement {
  readonly listeners: Array<{ listener: EventListenerOrEventListenerObject, options?: AddEventListenerOptions | boolean, type: string }>
}

class FakeResizeObserver {
  static readonly instances: FakeResizeObserver[] = []

  readonly disconnect = vi.fn()
  readonly observe = vi.fn()

  constructor(_callback: ResizeObserverCallback) {
    FakeResizeObserver.instances.push(this)
  }
}

const createdElements: FakeElement[] = []

function fakeElement(tagName = 'div'): FakeElement {
  const listeners: FakeElement['listeners'] = []
  const element = {
    addEventListener: vi.fn((
      type: string,
      listener: EventListenerOrEventListenerObject,
      options?: AddEventListenerOptions | boolean,
    ) => listeners.push({ listener, options, type })),
    append: vi.fn(),
    children: [],
    className: '',
    clientHeight: 600,
    clientWidth: 640,
    contains: vi.fn(() => false),
    listeners,
    ownerDocument: { getSelection: vi.fn(() => null) },
    querySelector: vi.fn(() => null),
    remove: vi.fn(),
    replaceChildren: vi.fn(),
    scrollHeight: 1200,
    scrollTo: vi.fn(),
    scrollTop: 0,
    setAttribute: vi.fn(),
    style: {},
    tabIndex: 0,
    tagName: tagName.toUpperCase(),
  } as unknown as FakeElement
  createdElements.push(element)
  return element
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

function source() {
  const bytes = new TextEncoder().encode('Memorilo')
  return {
    byteLength: bytes.byteLength,
    format: 'txt' as const,
    name: 'notes.txt',
    read: vi.fn(async () => bytes),
  }
}

beforeEach(() => {
  createdElements.length = 0
  FakeResizeObserver.instances.length = 0
  vi.clearAllMocks()
  harness.createProjection.mockReturnValue(harness.projection)
  vi.stubGlobal('document', {
    createElement: vi.fn((tagName: string) => fakeElement(tagName)),
    getSelection: vi.fn(() => null),
  })
  vi.stubGlobal('window', {
    matchMedia: vi.fn(() => ({ matches: false })),
  })
  vi.stubGlobal('ResizeObserver', FakeResizeObserver)
  vi.stubGlobal('requestAnimationFrame', vi.fn(() => 41))
  vi.stubGlobal('cancelAnimationFrame', vi.fn())
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('txt adapter lifecycle', () => {
  it('rejects an overlapping mount before the first mount settles', async () => {
    const adapter = await openTxtAdapter(source(), null, callbacks())
    const mounting = adapter.mount(fakeElement())

    await expect(adapter.mount(fakeElement())).rejects.toThrow('TXT reader is already mounted')
    await mounting
    await adapter.destroy()
  })

  it('releases observers, frames, listeners and DOM exactly once', async () => {
    const container = fakeElement()
    const adapter = await openTxtAdapter(source(), null, callbacks())
    await adapter.mount(container)
    const scroller = createdElements.find(element => element.listeners.some(listener => listener.type === 'scroll'))!
    const scroll = scroller.listeners.find(listener => listener.type === 'scroll')!
    if (typeof scroll.listener === 'function')
      scroll.listener({} as Event)

    const closing = adapter.destroy()
    expect(adapter.destroy()).toBe(closing)
    await closing

    expect(FakeResizeObserver.instances[0]!.disconnect).toHaveBeenCalledOnce()
    expect(cancelAnimationFrame).toHaveBeenCalledWith(41)
    expect(harness.regionDestroy).toHaveBeenCalledOnce()
    expect(harness.annotationClose).toHaveBeenCalledOnce()
    const surface = createdElements.find(element => element.className === 'reader-txt-surface')!
    expect(surface.remove).toHaveBeenCalledOnce()
    const listenerSignals = createdElements
      .flatMap(element => element.listeners)
      .map(listener => typeof listener.options === 'object' ? listener.options.signal : undefined)
      .filter((signal): signal is AbortSignal => signal !== undefined)
    expect(listenerSignals.length).toBeGreaterThan(0)
    expect(listenerSignals.every(signal => signal.aborted)).toBe(true)
  })

  it('can release partially mounted DOM after projection construction fails', async () => {
    const container = fakeElement()
    const adapter = await openTxtAdapter(source(), null, callbacks())
    harness.createProjection.mockImplementationOnce(() => {
      throw new Error('projection failed')
    })

    await expect(adapter.mount(container)).rejects.toThrow('projection failed')
    await expect(adapter.destroy()).resolves.toBeUndefined()

    expect(harness.annotationClose).toHaveBeenCalledOnce()
    expect(harness.regionDestroy).toHaveBeenCalledOnce()
    const surface = createdElements.find(element => element.className === 'reader-txt-surface')!
    expect(surface.remove).toHaveBeenCalledOnce()
  })

  it('retries failed DOM removal without repeating successful cleanup', async () => {
    const adapter = await openTxtAdapter(source(), null, callbacks())
    await adapter.mount(fakeElement())
    const surface = createdElements.find(element => element.className === 'reader-txt-surface')!
    const remove = vi.mocked(surface.remove)
    const failure = new Error('TXT surface is still attached')
    remove.mockImplementationOnce(() => {
      throw failure
    })

    const firstClose = adapter.destroy()
    expect(adapter.destroy()).toBe(firstClose)
    await expect(firstClose).rejects.toMatchObject({
      errors: [expect.objectContaining({
        cause: failure,
        message: 'Failed to close reader DOM',
      })],
    })
    expect(FakeResizeObserver.instances[0]!.disconnect).toHaveBeenCalledOnce()
    expect(harness.regionDestroy).toHaveBeenCalledOnce()
    expect(harness.annotationClose).toHaveBeenCalledOnce()

    await expect(adapter.destroy()).resolves.toBeUndefined()
    expect(remove).toHaveBeenCalledTimes(2)
    expect(FakeResizeObserver.instances[0]!.disconnect).toHaveBeenCalledOnce()
    expect(harness.regionDestroy).toHaveBeenCalledOnce()
    expect(harness.annotationClose).toHaveBeenCalledOnce()
  })
})
