import type { ReaderAdapterCallbacks } from '../reader-adapter'
import { deferred } from '@memorilo/effect-lifecycle/testing'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ComicPageView } from './comic-page-view'
import { FakeImage, installComicDom } from './comic-test-dom'

vi.mock('../region-selection.stylex', () => ({
  regionSelectionClassNames: {
    annotation: 'annotation',
    annotations: 'annotations',
    capture: 'capture',
    captureActive: 'capture-active',
    draft: 'draft',
  },
}))

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

function renderInput(
  signal: AbortSignal,
  overrides: Partial<Parameters<ComicPageView['render']>[0]> = {},
): Parameters<ComicPageView['render']>[0] {
  return {
    annotations: () => [],
    blob: new Blob(['comic-page'], { type: 'image/png' }),
    entryEdge: 'start',
    pageCount: 2,
    pageNumber: 1,
    scale: 1,
    signal,
    ...overrides,
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('comic page view lifecycle', () => {
  it.each([
    ['constructor', class ThrowingImage extends FakeImage {
      constructor() {
        super()
        throw new Error('image constructor failed')
      }
    }],
    ['src', class ThrowingSourceImage extends FakeImage {
      override get src(): string {
        return ''
      }

      override set src(_value: string) {
        throw new Error('image source failed')
      }
    }],
    ['decode', class ThrowingDecodeImage extends FakeImage {
      override decode(): Promise<void> {
        return Promise.reject(new Error('image decode failed'))
      }
    }],
  ])('releases a staged URL when image %s fails', async (_stage, imageConstructor) => {
    const { container, revoke } = installComicDom()
    vi.stubGlobal('Image', imageConstructor)
    const view = new ComicPageView(container as unknown as HTMLElement, {
      callbacks: callbacks(),
      format: 'cbz',
      onRegionSelection: vi.fn(),
    })

    await expect(view.render(renderInput(new AbortController().signal))).rejects.toThrow('Unable to decode comic page')
    expect(revoke).toHaveBeenCalledWith('blob:comic-1')
    await view.close()
    expect(revoke).toHaveBeenCalledTimes(1)
  })

  it('keeps the previous URL when a replacement cannot decode', async () => {
    const { container, revoke } = installComicDom()
    const secondDecode = deferred<void>()
    let imageCount = 0
    vi.stubGlobal('Image', class DeferredImage extends FakeImage {
      override decode(): Promise<void> {
        imageCount += 1
        return imageCount === 1 ? Promise.resolve() : secondDecode.promise
      }
    })
    const view = new ComicPageView(container as unknown as HTMLElement, {
      callbacks: callbacks(),
      format: 'cbz',
      onRegionSelection: vi.fn(),
    })
    const signal = new AbortController().signal

    await expect(view.render(renderInput(signal))).resolves.toBe(true)
    const replacement = view.render(renderInput(signal, { pageNumber: 2 }))
    await vi.waitFor(() => expect(imageCount).toBe(2))
    expect(revoke).not.toHaveBeenCalledWith('blob:comic-1')
    secondDecode.reject(new Error('replacement decode failed'))

    await expect(replacement).rejects.toThrow('Unable to decode comic page 2')
    expect(revoke).toHaveBeenCalledWith('blob:comic-2')
    expect(revoke).not.toHaveBeenCalledWith('blob:comic-1')
    await view.close()
    expect(revoke).toHaveBeenCalledWith('blob:comic-1')
  })

  it('waits for render rollback before close releases the page surface', async () => {
    const { container, revoke } = installComicDom()
    const decoding = deferred<void>()
    vi.stubGlobal('Image', class DeferredImage extends FakeImage {
      override decode(): Promise<void> {
        return decoding.promise
      }
    })
    const view = new ComicPageView(container as unknown as HTMLElement, {
      callbacks: callbacks(),
      format: 'cbz',
      onRegionSelection: vi.fn(),
    })

    const rendering = view.render(renderInput(new AbortController().signal))
    await vi.waitFor(() => expect(container.children).toHaveLength(1))
    const closing = view.close()

    await expect(rendering).resolves.toBe(false)
    await expect(closing).resolves.toBeUndefined()
    expect(revoke).toHaveBeenCalledWith('blob:comic-1')
    expect(container.children).toHaveLength(0)

    decoding.resolve()
  })

  it('supersedes an older render and releases its staged URL before committing the latest page', async () => {
    const { container, revoke } = installComicDom()
    const firstDecode = deferred<void>()
    let imageCount = 0
    vi.stubGlobal('Image', class DeferredImage extends FakeImage {
      override decode(): Promise<void> {
        imageCount += 1
        return imageCount === 1 ? firstDecode.promise : Promise.resolve()
      }
    })
    const view = new ComicPageView(container as unknown as HTMLElement, {
      callbacks: callbacks(),
      format: 'cbz',
      onRegionSelection: vi.fn(),
    })

    const first = view.render(renderInput(new AbortController().signal))
    await vi.waitFor(() => expect(imageCount).toBe(1))
    const second = view.render(renderInput(new AbortController().signal, { pageNumber: 2 }))

    await expect(second).resolves.toBe(true)
    await expect(first).resolves.toBe(false)
    expect(revoke).toHaveBeenCalledWith('blob:comic-1')
    expect(revoke).not.toHaveBeenCalledWith('blob:comic-2')
    await view.close()
    expect(revoke).toHaveBeenCalledWith('blob:comic-2')
    firstDecode.resolve()
  })

  it('releases the previous URL only after a replacement commits', async () => {
    const { container, revoke } = installComicDom()
    let imageCount = 0
    vi.stubGlobal('Image', class ImmediateImage extends FakeImage {
      override decode(): Promise<void> {
        imageCount += 1
        return Promise.resolve()
      }
    })
    const view = new ComicPageView(container as unknown as HTMLElement, {
      callbacks: callbacks(),
      format: 'cbz',
      onRegionSelection: vi.fn(),
    })
    const signal = new AbortController().signal

    await expect(view.render(renderInput(signal))).resolves.toBe(true)
    await expect(view.render(renderInput(signal, { pageNumber: 2 }))).resolves.toBe(true)

    expect(imageCount).toBe(2)
    expect(revoke).toHaveBeenCalledWith('blob:comic-1')
    expect(revoke).not.toHaveBeenCalledWith('blob:comic-2')
    await view.close()
    expect(revoke).toHaveBeenCalledWith('blob:comic-2')
  })

  it('keeps DOM ownership for a retry when close fails', async () => {
    const { container } = installComicDom()
    const view = new ComicPageView(container as unknown as HTMLElement, {
      callbacks: callbacks(),
      format: 'cbz',
      onRegionSelection: vi.fn(),
    })
    const scroller = container.children[0]!
    scroller.removeFailures = 1

    await expect(view.close()).rejects.toMatchObject({
      cause: expect.objectContaining({ message: 'page DOM removal failed' }),
      message: 'Failed to close page surface',
    })
    expect(container.children).toHaveLength(1)
    await expect(view.close()).resolves.toBeUndefined()
    expect(container.children).toHaveLength(0)
  })

  it('rolls back layout when scale positioning fails', async () => {
    const { container } = installComicDom()
    const view = new ComicPageView(container as unknown as HTMLElement, {
      callbacks: callbacks(),
      format: 'cbz',
      onRegionSelection: vi.fn(),
    })
    await view.render(renderInput(new AbortController().signal))
    const scroller = container.children[0]!
    const surface = scroller.children[0]!
    const previousHeight = surface.style.height
    const previousWidth = surface.style.width
    scroller.scrollTo = vi.fn(() => {
      throw new Error('scroll positioning failed')
    })

    expect(() => view.setScale(1.2)).toThrow('scroll positioning failed')
    expect(surface.style.height).toBe(previousHeight)
    expect(surface.style.width).toBe(previousWidth)
    await view.close()
  })
})
