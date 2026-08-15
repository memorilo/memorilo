import type { PDFDocumentProxy } from 'pdfjs-dist'
import type { ReaderAnnotation } from '../../types'
import type { ReaderAdapterCallbacks } from '../reader-adapter'
import type { PdfDocumentSession } from './pdf-document-session'
import type { PdfPageRenderInput } from './pdf-page-view'
import { deferred } from '@memorilo/effect-lifecycle/testing'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { openPdfAdapter } from './pdf-adapter'
import { PdfReaderMount } from './pdf-reader-mount'

interface FakePdfPageView {
  cancel: ReturnType<typeof vi.fn>
  captureTextSelection: ReturnType<typeof vi.fn>
  close: ReturnType<typeof vi.fn>
  render: ReturnType<typeof vi.fn<(input: PdfPageRenderInput) => Promise<boolean>>>
  scrollAnnotationIntoView: ReturnType<typeof vi.fn>
  setAnnotations: ReturnType<typeof vi.fn>
}

const harness = vi.hoisted(() => ({
  continuousMount: undefined as unknown as {
    close: ReturnType<typeof vi.fn>
    initialPageNumber: number
    moveViewport: ReturnType<typeof vi.fn>
    numPages: number
    outlineItems: readonly never[]
    pageNumberForOutline: ReturnType<typeof vi.fn>
    positionAt: ReturnType<typeof vi.fn>
    positionAtEdge: ReturnType<typeof vi.fn>
    render: ReturnType<typeof vi.fn>
    renderCurrentLayout: ReturnType<typeof vi.fn>
    scrollAnnotationIntoView: ReturnType<typeof vi.fn>
    setAnnotations: ReturnType<typeof vi.fn>
    setRegionSelectionEnabled: ReturnType<typeof vi.fn>
    textLayerKindAt: ReturnType<typeof vi.fn>
  },
  continuousOpen: vi.fn(),
  openDocumentSession: vi.fn(),
  pageView: undefined as unknown as FakePdfPageView,
}))

vi.mock('./pdf-document-session', () => ({
  openPdfDocumentSession: harness.openDocumentSession,
}))
vi.mock('./pdf-page-view', () => ({
  PdfPageView: class FakePdfPageViewConstructor {
    constructor() {
      return harness.pageView
    }
  },
}))
vi.mock('./pdf-continuous-reader-mount', () => ({
  PdfContinuousReaderMount: {
    open: harness.continuousOpen,
  },
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

class FakeResizeObserver {
  static readonly instances: FakeResizeObserver[] = []

  readonly disconnect = vi.fn()
  readonly observe = vi.fn()

  constructor(private readonly callback: ResizeObserverCallback) {
    FakeResizeObserver.instances.push(this)
  }

  trigger(): void {
    this.callback([], this as unknown as ResizeObserver)
  }
}

const createdElements: HTMLElement[] = []

function fakeElement(): HTMLElement {
  const element = {
    addEventListener: vi.fn(),
    append: vi.fn(),
    className: '',
    clientHeight: 600,
    clientWidth: 640,
    contains: vi.fn(() => false),
    querySelectorAll: vi.fn(() => []),
    remove: vi.fn(),
    removeEventListener: vi.fn(),
    replaceChildren: vi.fn(),
    scrollHeight: 600,
    scrollIntoView: vi.fn(),
    scrollLeft: 0,
    scrollTo: vi.fn(),
    scrollTop: 0,
    scrollWidth: 640,
    setAttribute: vi.fn(),
    style: { setProperty: vi.fn() },
  } as unknown as HTMLElement
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

function documentSession(): PdfDocumentSession {
  return {
    close: vi.fn(async () => undefined),
    document: {
      getOutline: vi.fn(async () => null),
      numPages: 1,
    } as unknown as PDFDocumentProxy,
    pdfJs: {} as PdfDocumentSession['pdfJs'],
  }
}

function pageView(
  render: FakePdfPageView['render'] = vi.fn(async () => true),
): FakePdfPageView {
  return {
    cancel: vi.fn(),
    captureTextSelection: vi.fn(),
    close: vi.fn(async () => undefined),
    render,
    scrollAnnotationIntoView: vi.fn(),
    setAnnotations: vi.fn(),
  }
}

function continuousMount() {
  return {
    close: vi.fn(async () => undefined),
    initialPageNumber: 8,
    moveViewport: vi.fn(() => 'at-boundary'),
    numPages: 12,
    outlineItems: [],
    pageNumberForOutline: vi.fn(async () => 1),
    positionAt: vi.fn(),
    positionAtEdge: vi.fn(),
    render: vi.fn(async () => true),
    renderCurrentLayout: vi.fn(async () => true),
    scrollAnnotationIntoView: vi.fn(),
    setAnnotations: vi.fn(),
    setRegionSelectionEnabled: vi.fn(),
    textLayerKindAt: vi.fn(() => 'embedded'),
  }
}

function annotation(): ReaderAnnotation {
  return {
    anchors: [{
      format: 'pdf',
      pageNumber: 1,
      rect: { height: 0.1, width: 0.2, x: 0.1, y: 0.1 },
      type: 'region',
    }],
    color: 'yellow',
    createdAt: 1,
    id: 'annotation',
    style: 'highlight',
    updatedAt: 1,
  }
}

function source() {
  return {
    byteLength: 1,
    format: 'pdf' as const,
    name: 'book.pdf',
    read: vi.fn(async () => new Uint8Array([0])),
  }
}

function scroller(): HTMLElement {
  const element = createdElements.find(candidate => candidate.className === 'reader-pdf-scroller')
  if (!element)
    throw new Error('PDF scroller was not created')
  return element
}

beforeEach(() => {
  createdElements.length = 0
  FakeResizeObserver.instances.length = 0
  harness.openDocumentSession.mockReset()
  harness.openDocumentSession.mockResolvedValue(documentSession())
  harness.pageView = pageView()
  harness.continuousMount = continuousMount()
  harness.continuousOpen.mockReset()
  harness.continuousOpen.mockResolvedValue(harness.continuousMount)
  vi.stubGlobal('document', {
    createElement: vi.fn(() => fakeElement()),
    getSelection: vi.fn(() => null),
  })
  vi.stubGlobal('ResizeObserver', FakeResizeObserver)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('pdf adapter layout ownership', () => {
  it('uses the continuous mount and restores its logical page position', async () => {
    const initialPosition = { format: 'pdf' as const, pageNumber: 8, pageProgress: 0.42 }
    const adapter = openPdfAdapter(source(), 'continuous', initialPosition, undefined, callbacks())

    await adapter.mount(fakeElement())

    expect(harness.continuousOpen).toHaveBeenCalledWith(expect.objectContaining({
      initialPosition,
    }))
    expect(harness.continuousMount.positionAt).toHaveBeenCalledWith(8, 0.42)
    expect(harness.pageView.render).not.toHaveBeenCalled()
    await adapter.destroy()
  })

  it('rejects an overlapping mount before the first document acquisition settles', async () => {
    const opening = deferred<PdfDocumentSession>()
    const session = documentSession()
    harness.openDocumentSession.mockReturnValue(opening.promise)
    const adapter = openPdfAdapter(source(), 'single-page', null, undefined, callbacks())
    const mounting = adapter.mount(fakeElement())

    await expect(adapter.mount(fakeElement())).rejects.toThrow('PDF reader is already mounted')
    opening.resolve(session)
    await mounting
    await adapter.destroy()
  })

  it('completes the initial render before observing layout changes', async () => {
    const initialRender = deferred<boolean>()
    harness.pageView = pageView(vi.fn(async () => initialRender.promise))
    const adapter = openPdfAdapter(source(), 'single-page', null, undefined, callbacks())
    const mounting = adapter.mount(fakeElement())

    await vi.waitFor(() => expect(harness.pageView.render).toHaveBeenCalledOnce())
    expect(harness.pageView.render).toHaveBeenCalledWith({
      availableWidth: 592,
      forceOcr: false,
      pageNumber: 1,
      scale: 1,
    })
    expect(FakeResizeObserver.instances).toHaveLength(0)

    initialRender.resolve(true)
    await mounting

    expect(FakeResizeObserver.instances).toHaveLength(1)
    expect(FakeResizeObserver.instances[0]!.observe).toHaveBeenCalledWith(scroller())
    await adapter.destroy()
  })

  it('coalesces repeated observations of the same available width', async () => {
    const adapter = openPdfAdapter(source(), 'single-page', null, undefined, callbacks())
    await adapter.mount(fakeElement())
    const observer = FakeResizeObserver.instances[0]!

    observer.trigger()
    observer.trigger()
    await adapter.setScale!(1)
    expect(harness.pageView.render).toHaveBeenCalledOnce()

    Object.defineProperty(scroller(), 'clientWidth', { configurable: true, value: 700 })
    observer.trigger()
    observer.trigger()
    await adapter.setScale!(1)

    expect(harness.pageView.render).toHaveBeenCalledTimes(2)
    expect(harness.pageView.render).toHaveBeenLastCalledWith({
      availableWidth: 652,
      forceOcr: false,
      pageNumber: 1,
      scale: 1,
    })

    observer.trigger()
    await adapter.setScale!(1)
    expect(harness.pageView.render).toHaveBeenCalledTimes(2)
    await adapter.destroy()
  })

  it('scrolls the exact annotation marker into view', async () => {
    const adapter = openPdfAdapter(source(), 'single-page', null, undefined, callbacks())
    await adapter.mount(fakeElement())
    adapter.setAnnotations([annotation()])

    await adapter.goToAnnotation('annotation')

    expect(harness.pageView.scrollAnnotationIntoView).toHaveBeenCalledExactlyOnceWith('annotation')
    await adapter.destroy()
  })

  it('renders a same-width layout when its scale identity changes', async () => {
    const readerCallbacks = callbacks()
    const mount = await PdfReaderMount.open({
      annotations: [],
      callbacks: readerCallbacks,
      container: fakeElement(),
      initialPageNumber: 1,
      onRegionSelection: vi.fn(),
      onResize: vi.fn(),
      onTextLayerKindChange: vi.fn(),
      onTextSelection: vi.fn(),
      scale: 1,
      signal: new AbortController().signal,
      source: source(),
    })

    await expect(mount.renderCurrentLayout(
      1,
      1.2,
      new AbortController().signal,
    )).resolves.toBe(true)
    expect(harness.pageView.render).toHaveBeenCalledTimes(2)
    expect(harness.pageView.render).toHaveBeenLastCalledWith({
      availableWidth: 592,
      forceOcr: false,
      pageNumber: 1,
      scale: 1.2,
    })
    await mount.close()
  })

  it('rolls back a failed mount and allows a clean retry', async () => {
    const renderFailure = new Error('initial render failed')
    const failedSession = documentSession()
    const retrySession = documentSession()
    const failedPageView = pageView(vi.fn(async () => {
      throw renderFailure
    }))
    harness.openDocumentSession
      .mockResolvedValueOnce(failedSession)
      .mockResolvedValueOnce(retrySession)
    harness.pageView = failedPageView
    const adapter = openPdfAdapter(source(), 'single-page', null, undefined, callbacks())

    await expect(adapter.mount(fakeElement())).rejects.toBe(renderFailure)

    const failedScroller = scroller()
    expect(failedPageView.close).toHaveBeenCalledOnce()
    expect(failedSession.close).toHaveBeenCalledOnce()
    expect(failedScroller.remove).toHaveBeenCalledOnce()

    const retryPageView = pageView()
    harness.pageView = retryPageView
    await expect(adapter.mount(fakeElement())).resolves.toBeUndefined()
    expect(retryPageView.render).toHaveBeenCalledOnce()
    await adapter.destroy()
    expect(retrySession.close).toHaveBeenCalledOnce()
  })

  it('waits for an unresponsive render during destroy and ignores its stale result', async () => {
    const pendingRender = deferred<boolean>()
    const render = vi.fn()
      .mockResolvedValueOnce(true)
      .mockImplementationOnce(async () => pendingRender.promise)
    harness.pageView = pageView(render)
    const readerCallbacks = callbacks()
    const adapter = openPdfAdapter(source(), 'single-page', null, undefined, readerCallbacks)
    await adapter.mount(fakeElement())

    const scaling = adapter.setScale!(1.2)
    await vi.waitFor(() => expect(render).toHaveBeenCalledTimes(2))
    const closing = adapter.destroy()

    pendingRender.resolve(true)
    await expect(closing).resolves.toBeUndefined()
    await expect(scaling).resolves.toBeUndefined()
    expect(readerCallbacks.onStateChange).toHaveBeenCalledOnce()

    await Promise.resolve()
    expect(readerCallbacks.onStateChange).toHaveBeenCalledOnce()
  })

  it('continues cleanup after a page-view failure and retries only that resource', async () => {
    const failure = new Error('canvas release failed')
    const session = documentSession()
    harness.openDocumentSession.mockResolvedValue(session)
    harness.pageView.close
      .mockRejectedValueOnce(failure)
      .mockResolvedValueOnce(undefined)
    const adapter = openPdfAdapter(source(), 'single-page', null, undefined, callbacks())
    await adapter.mount(fakeElement())

    const firstClose = adapter.destroy()
    expect(adapter.destroy()).toBe(firstClose)
    await expect(firstClose).rejects.toMatchObject({
      errors: [expect.objectContaining({
        cause: failure,
        message: 'Failed to close PDF page view',
      })],
    })
    expect(harness.pageView.close).toHaveBeenCalledOnce()
    expect(session.close).toHaveBeenCalledOnce()

    await expect(adapter.destroy()).resolves.toBeUndefined()
    expect(harness.pageView.close).toHaveBeenCalledTimes(2)
    expect(session.close).toHaveBeenCalledOnce()
  })

  it('retries only failed surface cleanup without reopening the mounted reader', async () => {
    const failure = new Error('page surface is still attached')
    const session = documentSession()
    harness.openDocumentSession.mockResolvedValue(session)
    const adapter = openPdfAdapter(source(), 'single-page', null, undefined, callbacks())
    await adapter.mount(fakeElement())
    const remove = vi.mocked(scroller().remove)
    remove.mockImplementationOnce(() => {
      throw failure
    })

    const firstClose = adapter.destroy()
    expect(adapter.destroy()).toBe(firstClose)
    await expect(firstClose).rejects.toMatchObject({
      errors: [expect.objectContaining({
        cause: failure,
        message: 'Failed to close reader surface',
      })],
    })
    expect(harness.pageView.close).toHaveBeenCalledOnce()
    expect(session.close).toHaveBeenCalledOnce()
    expect(remove).toHaveBeenCalledOnce()

    await expect(adapter.destroy()).resolves.toBeUndefined()
    expect(harness.pageView.close).toHaveBeenCalledOnce()
    expect(session.close).toHaveBeenCalledOnce()
    expect(remove).toHaveBeenCalledTimes(2)
  })
})
