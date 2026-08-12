import type { PDFPageProxy, TextLayer } from 'pdfjs-dist'
import type { ReaderAdapterCallbacks } from '../reader-adapter'
import { deferred } from '@memorilo/effect-lifecycle/testing'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PdfTextLayer } from './pdf-text-layer'

function callbacks(): ReaderAdapterCallbacks {
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

function layer(initialNodes: readonly Node[] = []): HTMLDivElement {
  let className = 'reader-pdf-text-layer'
  let nodes = [...initialNodes]
  const element = {
    append: vi.fn((...next: (Node | string)[]) => {
      nodes.push(...next.filter((node): node is Node => typeof node !== 'string'))
    }),
    get className() {
      return className
    },
    set className(value: string) {
      className = value
    },
    classList: {
      add: vi.fn((name: string) => {
        const names = new Set(className.split(' ').filter(Boolean))
        names.add(name)
        className = [...names].join(' ')
      }),
      remove: vi.fn((name: string) => {
        className = className.split(' ').filter(candidate => candidate !== name).join(' ')
      }),
    },
    clientHeight: 800,
    cloneNode: vi.fn(() => {
      const clone = layer()
      clone.className = className
      return clone
    }),
    contains: vi.fn(() => false),
    get childNodes() {
      return nodes
    },
    replaceChildren: vi.fn((...next: Node[]) => {
      nodes = [...next]
    }),
  }
  return element as unknown as HTMLDivElement
}

function pageWithText(items: readonly unknown[]) {
  return {
    getTextContent: vi.fn(async () => ({ items })),
  } as unknown as PDFPageProxy
}

const viewport = { height: 800, width: 600 } as ReturnType<PDFPageProxy['getViewport']>

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('pdf text layer', () => {
  it('projects embedded text and publishes its selectable state', async () => {
    const rendered = vi.fn(async () => undefined)
    const configurations: unknown[] = []
    class FakeTextLayer {
      readonly cancel = vi.fn()

      constructor(configuration: unknown) {
        configurations.push(configuration)
      }

      render = rendered
    }
    const readerCallbacks = callbacks()
    const textLayer = layer()
    const kindChange = vi.fn()
    const projection = new PdfTextLayer({
      callbacks: readerCallbacks,
      layer: textLayer,
      onKindChange: kindChange,
      pageSurface: {} as HTMLDivElement,
      TextLayer: FakeTextLayer as unknown as typeof TextLayer,
    })

    const prepared = await projection.render({
      canvas: {} as HTMLCanvasElement,
      forceOcr: false,
      page: pageWithText([{ str: 'Readable text' }]),
      pageNumber: 1,
      viewport,
    }, {
      isCurrent: () => true,
      signal: new AbortController().signal,
    })
    prepared?.commit()

    expect(configurations).toHaveLength(1)
    expect(rendered).toHaveBeenCalledOnce()
    expect(textLayer.className).toBe('reader-pdf-text-layer')
    expect(kindChange).toHaveBeenLastCalledWith('embedded')
    expect(readerCallbacks.onOcrStatusChange).toHaveBeenCalledWith({ pageNumber: 1, state: 'idle' })
    projection.close()
  })

  it('does not commit text content that resolves after the layer closes', async () => {
    const content = deferred<{ items: readonly unknown[] }>()
    const constructed = vi.fn()
    class FakeTextLayer {
      readonly cancel = vi.fn()

      constructor() {
        constructed()
      }

      render = vi.fn(async () => undefined)
    }
    const controller = new AbortController()
    let current = true
    const projection = new PdfTextLayer({
      callbacks: callbacks(),
      layer: layer(),
      onKindChange: vi.fn(),
      pageSurface: {} as HTMLDivElement,
      TextLayer: FakeTextLayer as unknown as typeof TextLayer,
    })
    const page = {
      getTextContent: vi.fn(async () => content.promise),
    } as unknown as PDFPageProxy

    const rendering = projection.render({
      canvas: {} as HTMLCanvasElement,
      forceOcr: false,
      page,
      pageNumber: 1,
      viewport,
    }, {
      isCurrent: () => current,
      signal: controller.signal,
    })
    await vi.waitFor(() => expect(page.getTextContent).toHaveBeenCalledOnce())

    projection.close()
    current = false
    controller.abort(new Error('PDF page superseded'))
    content.resolve({ items: [{ str: 'Late text' }] })

    await expect(rendering).resolves.toBeNull()
    expect(constructed).not.toHaveBeenCalled()
  })

  it('keeps the committed text projection intact when a replacement render fails', async () => {
    const previousText = { textContent: 'Previous page' } as Node
    const textLayer = layer([previousText])
    const failure = new Error('text projection failed')
    class FailingTextLayer {
      readonly cancel = vi.fn()
      render = vi.fn(async () => {
        throw failure
      })
    }
    const kindChange = vi.fn()
    const projection = new PdfTextLayer({
      callbacks: callbacks(),
      layer: textLayer,
      onKindChange: kindChange,
      pageSurface: {} as HTMLDivElement,
      TextLayer: FailingTextLayer as unknown as typeof TextLayer,
    })

    await expect(projection.render({
      canvas: {} as HTMLCanvasElement,
      forceOcr: false,
      page: pageWithText([{ str: 'Replacement page' }]),
      pageNumber: 2,
      viewport,
    }, {
      isCurrent: () => true,
      signal: new AbortController().signal,
    })).rejects.toBe(failure)

    expect([...textLayer.childNodes]).toEqual([previousText])
    expect(kindChange).not.toHaveBeenCalled()
    projection.close()
  })

  it('reuses OCR results until an explicit recognition refresh', async () => {
    vi.stubGlobal('document', {
      createElement: vi.fn(() => ({ style: {}, textContent: '' } as unknown as HTMLElement)),
    })
    const textLayer = layer()
    const recognize = vi.fn(async () => ({
      items: [{
        rect: { height: 0.1, width: 0.4, x: 0.2, y: 0.3 },
        text: 'Recognized text',
      }],
    }))
    const canvas = {
      height: 1600,
      toBlob: (resolve: BlobCallback) => resolve(new Blob(['page'])),
      width: 1200,
    } as unknown as HTMLCanvasElement
    const readerCallbacks = callbacks()
    const projection = new PdfTextLayer({
      callbacks: readerCallbacks,
      layer: textLayer,
      ocrProvider: recognize,
      onKindChange: vi.fn(),
      pageSurface: {} as HTMLDivElement,
      TextLayer: class {} as unknown as typeof TextLayer,
    })
    const render = async (forceOcr: boolean) => {
      const prepared = await projection.render({
        canvas,
        forceOcr,
        page: pageWithText([]),
        pageNumber: 2,
        viewport,
      }, {
        isCurrent: () => true,
        signal: new AbortController().signal,
      })
      prepared?.commit()
    }

    await render(false)
    await render(false)
    expect(recognize).toHaveBeenCalledOnce()

    await render(true)
    expect(recognize).toHaveBeenCalledTimes(2)
    expect((Array.from(textLayer.childNodes).at(-1) as HTMLElement | undefined)?.textContent).toBe('Recognized text')
    expect(readerCallbacks.onOcrStatusChange).toHaveBeenLastCalledWith({
      pageNumber: 2,
      state: 'ready',
    })
    projection.close()
  })

  it('reports OCR progress without changing the committed text kind before commit', async () => {
    vi.stubGlobal('document', {
      createElement: vi.fn(() => ({ style: {}, textContent: '' } as unknown as HTMLElement)),
    })
    const recognition = deferred<{
      items: readonly [{ rect: { height: number, width: number, x: number, y: number }, text: string }]
    }>()
    const readerCallbacks = callbacks()
    const kindChange = vi.fn()
    const projection = new PdfTextLayer({
      callbacks: readerCallbacks,
      layer: layer(),
      ocrProvider: async () => recognition.promise,
      onKindChange: kindChange,
      pageSurface: {} as HTMLDivElement,
      TextLayer: class {} as unknown as typeof TextLayer,
    })
    const rendering = projection.render({
      canvas: {
        height: 1600,
        toBlob: (resolve: BlobCallback) => resolve(new Blob(['page'])),
        width: 1200,
      } as unknown as HTMLCanvasElement,
      forceOcr: true,
      page: pageWithText([]),
      pageNumber: 1,
      viewport,
    }, {
      isCurrent: () => true,
      signal: new AbortController().signal,
    })

    await vi.waitFor(() => expect(readerCallbacks.onOcrStatusChange).toHaveBeenCalledWith({
      pageNumber: 1,
      state: 'recognizing',
    }))
    expect(kindChange).not.toHaveBeenCalled()

    recognition.resolve({
      items: [{
        rect: { height: 0.1, width: 0.4, x: 0.2, y: 0.3 },
        text: 'Recognized text',
      }],
    })
    const prepared = await rendering
    expect(kindChange).not.toHaveBeenCalled()

    prepared?.commit()
    expect(kindChange).toHaveBeenCalledOnce()
    expect(kindChange).toHaveBeenCalledWith('ocr')
    projection.close()
  })

  it('retries text-layer cleanup that failed after admission closed', () => {
    const textLayer = layer()
    const failure = new Error('text layer is unloading')
    vi.mocked(textLayer.replaceChildren).mockImplementationOnce(() => {
      throw failure
    })
    const projection = new PdfTextLayer({
      callbacks: callbacks(),
      layer: textLayer,
      onKindChange: vi.fn(),
      pageSurface: {} as HTMLDivElement,
      TextLayer: class {} as unknown as typeof TextLayer,
    })

    expect(() => projection.close()).toThrow(failure)
    expect(() => projection.close()).not.toThrow()
    expect(textLayer.replaceChildren).toHaveBeenCalledTimes(2)
  })
})
