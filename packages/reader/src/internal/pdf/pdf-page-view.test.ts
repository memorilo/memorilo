import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist'
import type { ReaderAnnotation } from '../../types'
import type { ReaderAdapterCallbacks } from '../reader-adapter'
import type { PdfJsModule } from './pdf-page-view'
import { deferred } from '@memorilo/effect-lifecycle/testing'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PdfPageView } from './pdf-page-view'

function page() {
  return { cleanup: vi.fn() } as unknown as PDFPageProxy
}

function readerCallbacks(): ReaderAdapterCallbacks {
  return {
    onAnnotationActivate: vi.fn(),
    onError: vi.fn(),
    onKeyDown: vi.fn(),
    onOcrStatusChange: vi.fn(),
    onRegionSelectionModeChange: vi.fn(),
    onSelectionChange: vi.fn(),
    onStateChange: vi.fn(),
    regionAnnotationLabel: vi.fn(() => 'Annotation'),
  }
}

function createView(
  getPage: (pageNumber: number) => Promise<PDFPageProxy>,
  options: {
    annotationLayer?: HTMLDivElement
    callbacks?: ReaderAdapterCallbacks
    canvas?: HTMLCanvasElement
    pageSurface?: HTMLDivElement
    pdfJs?: PdfJsModule
    textLayer?: HTMLDivElement
  } = {},
) {
  const annotationLayer = options.annotationLayer ?? {
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  } as unknown as HTMLDivElement
  const textLayer = options.textLayer ?? {
    classList: { add: vi.fn(), remove: vi.fn() },
    contains: vi.fn(() => false),
    replaceChildren: vi.fn(),
  } as unknown as HTMLDivElement
  return new PdfPageView({
    annotationLayer,
    callbacks: options.callbacks ?? readerCallbacks(),
    canvas: options.canvas ?? {} as HTMLCanvasElement,
    document: { getPage, numPages: 2 } as unknown as PDFDocumentProxy,
    onTextLayerKindChange: vi.fn(),
    pageSurface: options.pageSurface ?? {} as HTMLDivElement,
    pdfJs: options.pdfJs ?? {} as PdfJsModule,
    textLayer,
  })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('pdf page view lifecycle', () => {
  it('cancels an active acquisition without closing future render admission', async () => {
    const firstAcquisition = deferred<PDFPageProxy>()
    const secondAcquisition = deferred<PDFPageProxy>()
    const firstPage = page()
    const secondPage = page()
    const getPage = vi.fn()
      .mockImplementationOnce(async () => firstAcquisition.promise)
      .mockImplementationOnce(async () => secondAcquisition.promise)
    const view = createView(getPage)

    const firstRender = view.render({ availableWidth: 160, forceOcr: false, pageNumber: 1, scale: 1 })
    await vi.waitFor(() => expect(getPage).toHaveBeenCalledOnce())
    view.cancel(new Error('reader shutdown began'))
    firstAcquisition.resolve(firstPage)

    await expect(firstRender).resolves.toBe(false)
    expect(firstPage.cleanup).toHaveBeenCalledOnce()

    const secondRender = view.render({ availableWidth: 160, forceOcr: false, pageNumber: 2, scale: 1 })
    await vi.waitFor(() => expect(getPage).toHaveBeenCalledTimes(2))
    const close = view.close()
    secondAcquisition.resolve(secondPage)

    await expect(secondRender).resolves.toBe(false)
    await close
    expect(secondPage.cleanup).toHaveBeenCalledOnce()
  })

  it('drains a page acquisition and cleans the late page before close resolves', async () => {
    const acquisition = deferred<PDFPageProxy>()
    const acquiredPage = page()
    const getPage = vi.fn(async () => acquisition.promise)
    const view = createView(getPage)

    const render = view.render({ availableWidth: 160, forceOcr: false, pageNumber: 1, scale: 1 })
    await vi.waitFor(() => expect(getPage).toHaveBeenCalledOnce())
    const close = view.close()
    expect(view.close()).toBe(close)
    let closed = false
    void close.then(() => {
      closed = true
    })
    await Promise.resolve()
    expect(closed).toBe(false)
    expect(acquiredPage.cleanup).not.toHaveBeenCalled()

    acquisition.resolve(acquiredPage)

    await expect(render).resolves.toBe(false)
    await close
    expect(closed).toBe(true)
    expect(acquiredPage.cleanup).toHaveBeenCalledOnce()
    await expect(view.render({ availableWidth: 160, forceOcr: false, pageNumber: 1, scale: 1 })).resolves.toBe(false)
  })

  it('continues page cleanup after annotation listener removal fails and retries it', async () => {
    const failure = new Error('annotation layer is unloading')
    const removeEventListener = vi.fn()
      .mockImplementationOnce(() => {
        throw failure
      })
    const view = createView(async () => page(), {
      annotationLayer: {
        addEventListener: vi.fn(),
        removeEventListener,
      } as unknown as HTMLDivElement,
    })

    await expect(view.close()).rejects.toMatchObject({
      errors: [expect.objectContaining({
        cause: failure,
        message: 'Failed to close annotation activation',
      })],
    })
    expect(removeEventListener).toHaveBeenCalledOnce()
    await expect(view.close()).resolves.toBeUndefined()
    expect(removeEventListener).toHaveBeenCalledTimes(2)
  })

  it('continues dependent cleanup when render cancellation fails and retries only that cleanup', async () => {
    const renderFinished = deferred<void>()
    const cancelFailure = new Error('PDF.js render task rejected cancellation')
    const renderTask = {
      cancel: vi.fn(() => {
        throw cancelFailure
      }),
      promise: renderFinished.promise,
    }
    const acquiredPage = {
      cleanup: vi.fn(),
      getViewport: vi.fn(({ scale }: { scale: number }) => ({
        height: 800 * scale,
        scale,
        width: 600 * scale,
      })),
      render: vi.fn(() => renderTask),
    } as unknown as PDFPageProxy
    const removeEventListener = vi.fn()
    const replaceTextChildren = vi.fn()
    vi.stubGlobal('document', {
      createElement: vi.fn(() => ({
        className: '',
        setAttribute: vi.fn(),
        style: {},
      } as unknown as HTMLCanvasElement)),
    })
    vi.stubGlobal('window', { devicePixelRatio: 1 })
    const view = createView(async () => acquiredPage, {
      annotationLayer: {
        addEventListener: vi.fn(),
        removeEventListener,
      } as unknown as HTMLDivElement,
      pageSurface: {} as HTMLDivElement,
      pdfJs: {
        RenderingCancelledException: class extends Error {},
      } as unknown as PdfJsModule,
      textLayer: {
        classList: { add: vi.fn(), remove: vi.fn() },
        contains: vi.fn(() => false),
        replaceChildren: replaceTextChildren,
      } as unknown as HTMLDivElement,
    })

    const render = view.render({ availableWidth: 600, forceOcr: false, pageNumber: 1, scale: 1 })
    await vi.waitFor(() => expect(acquiredPage.render).toHaveBeenCalledOnce())
    const close = view.close()
    renderFinished.resolve()

    await expect(render).resolves.toBe(false)
    await expect(close).rejects.toMatchObject({
      errors: [expect.objectContaining({
        cause: cancelFailure,
        message: 'Failed to close active rendering tasks',
      })],
    })
    expect(acquiredPage.cleanup).toHaveBeenCalledOnce()
    expect(replaceTextChildren).toHaveBeenCalledOnce()
    expect(removeEventListener).toHaveBeenCalledOnce()

    await expect(view.close()).resolves.toBeUndefined()
    expect(acquiredPage.cleanup).toHaveBeenCalledOnce()
    expect(replaceTextChildren).toHaveBeenCalledOnce()
    expect(removeEventListener).toHaveBeenCalledOnce()
  })

  it('invalidates a stale page acquisition when a newer render begins', async () => {
    const first = deferred<PDFPageProxy>()
    const second = deferred<PDFPageProxy>()
    const firstPage = page()
    const secondPage = page()
    const getPage = vi.fn()
      .mockImplementationOnce(async () => first.promise)
      .mockImplementationOnce(async () => second.promise)
    const view = createView(getPage)

    const firstRender = view.render({ availableWidth: 160, forceOcr: false, pageNumber: 1, scale: 1 })
    await vi.waitFor(() => expect(getPage).toHaveBeenCalledOnce())
    const secondRender = view.render({ availableWidth: 160, forceOcr: false, pageNumber: 2, scale: 1 })
    await vi.waitFor(() => expect(getPage).toHaveBeenCalledTimes(2))
    first.resolve(firstPage)

    await expect(firstRender).resolves.toBe(false)
    expect(firstPage.cleanup).toHaveBeenCalledOnce()

    const close = view.close()
    second.resolve(secondPage)
    await expect(secondRender).resolves.toBe(false)
    await close
    expect(secondPage.cleanup).toHaveBeenCalledOnce()
  })

  it('does not replace the committed page when text projection fails', async () => {
    const failure = new Error('text projection failed')
    const oldCanvas = { replaceWith: vi.fn() } as unknown as HTMLCanvasElement
    const pageSurface = {
      style: {
        setProperty: vi.fn(),
      },
    } as unknown as HTMLDivElement
    const annotationLayer = {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      replaceChildren: vi.fn(),
    } as unknown as HTMLDivElement
    const stagedTextLayer = {
      childNodes: [],
      className: 'reader-pdf-text-layer',
      classList: { add: vi.fn(), remove: vi.fn() },
      replaceChildren: vi.fn(),
    } as unknown as HTMLDivElement
    const textLayer = {
      childNodes: [{ textContent: 'Previous text' }],
      className: 'reader-pdf-text-layer',
      classList: { add: vi.fn(), remove: vi.fn() },
      cloneNode: vi.fn(() => stagedTextLayer),
      contains: vi.fn(() => false),
      replaceChildren: vi.fn(),
    } as unknown as HTMLDivElement
    class FailingTextLayer {
      readonly cancel = vi.fn()
      render = vi.fn(async () => {
        throw failure
      })
    }
    class RenderingCancelledException extends Error {}
    const renderTask = {
      cancel: vi.fn(),
      promise: Promise.resolve(),
    }
    const acquiredPage = {
      cleanup: vi.fn(),
      getTextContent: vi.fn(async () => ({ items: [{ str: 'Replacement text' }] })),
      getViewport: vi.fn(({ scale }: { scale: number }) => ({
        height: 800 * scale,
        scale,
        width: 600 * scale,
      })),
      render: vi.fn(() => renderTask),
    } as unknown as PDFPageProxy
    const nextCanvas = {
      className: '',
      setAttribute: vi.fn(),
      style: {},
    } as unknown as HTMLCanvasElement
    vi.stubGlobal('document', {
      createElement: vi.fn(() => nextCanvas),
    })
    vi.stubGlobal('window', { devicePixelRatio: 1 })
    const view = createView(async () => acquiredPage, {
      annotationLayer,
      canvas: oldCanvas,
      pageSurface,
      pdfJs: {
        RenderingCancelledException,
        TextLayer: FailingTextLayer,
      } as unknown as PdfJsModule,
      textLayer,
    })

    await expect(view.render({
      availableWidth: 600,
      forceOcr: false,
      pageNumber: 1,
      scale: 1,
    })).rejects.toBe(failure)

    expect(oldCanvas.replaceWith).not.toHaveBeenCalled()
    expect(textLayer.replaceChildren).not.toHaveBeenCalled()
    expect(annotationLayer.replaceChildren).not.toHaveBeenCalled()
    expect(pageSurface.style.setProperty).not.toHaveBeenCalled()
    await view.close()
  })

  it('publishes annotation ids on note markers and delegates activation', async () => {
    let clickListener: EventListener | undefined
    const appended: HTMLElement[] = []
    const annotationLayer = {
      addEventListener: vi.fn((type: string, listener: EventListener) => {
        if (type === 'click')
          clickListener = listener
      }),
      contains: vi.fn(() => true),
      removeEventListener: vi.fn(),
      replaceChildren: vi.fn((...elements: HTMLElement[]) => appended.push(...elements)),
    } as unknown as HTMLDivElement
    const callbacks = readerCallbacks()
    vi.stubGlobal('document', {
      createElement: vi.fn(() => ({
        className: '',
        dataset: {},
        setAttribute: vi.fn(),
        style: {},
        type: '',
      } as unknown as HTMLElement)),
    })
    const view = createView(async () => page(), { annotationLayer, callbacks })
    const annotation: ReaderAnnotation = {
      anchors: [{
        format: 'pdf',
        pageNumber: 1,
        rect: { height: 0.2, width: 0.3, x: 0.1, y: 0.2 },
        type: 'region',
      }],
      annotationTopicId: 'topic-1',
      color: 'yellow',
      createdAt: 1,
      id: 'annotation-1',
      style: 'highlight',
      updatedAt: 1,
    }

    view.setAnnotations([annotation], 1)

    const marker = appended.find(element => element.dataset.annotationId === annotation.id)
    expect(marker?.dataset.annotationId).toBe(annotation.id)
    clickListener?.({
      target: { closest: () => marker },
    } as unknown as Event)
    expect(callbacks.onAnnotationActivate).toHaveBeenCalledWith({ annotationId: annotation.id })
    await view.close()
  })

  it('keeps the committed annotation projection when a replacement is invalid', async () => {
    const replaceChildren = vi.fn()
    const annotationLayer = {
      addEventListener: vi.fn(),
      contains: vi.fn(() => true),
      removeEventListener: vi.fn(),
      replaceChildren,
    } as unknown as HTMLDivElement
    vi.stubGlobal('document', {
      createElement: vi.fn(() => ({
        className: '',
        dataset: {},
        setAttribute: vi.fn(),
        style: {},
        type: '',
      } as unknown as HTMLElement)),
    })
    const view = createView(async () => page(), { annotationLayer })
    const valid: ReaderAnnotation = {
      anchors: [{
        format: 'pdf',
        pageNumber: 1,
        rect: { height: 0.2, width: 0.3, x: 0.1, y: 0.2 },
        type: 'region',
      }],
      annotationTopicId: 'topic-valid',
      color: 'yellow',
      createdAt: 1,
      id: 'valid',
      style: 'highlight',
      updatedAt: 1,
    }
    const invalid: ReaderAnnotation = {
      ...valid,
      anchors: [{
        format: 'pdf',
        pageNumber: 1,
        quote: { exact: 'Missing rectangle' },
        rects: [],
        source: 'embedded',
        type: 'text',
      }],
      id: 'invalid',
    }

    view.setAnnotations([valid], 1)
    expect(() => view.setAnnotations([invalid], 1)).toThrow(
      'PDF annotation invalid has no visible anchor rectangle',
    )

    expect(replaceChildren).toHaveBeenCalledOnce()
    view.setAnnotations([valid], 1)
    expect(replaceChildren).toHaveBeenCalledTimes(2)
    await view.close()
  })
})
