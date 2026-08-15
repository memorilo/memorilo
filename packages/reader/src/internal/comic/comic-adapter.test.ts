import type { ReaderAnnotation } from '../../types'
import type { ReaderAdapterCallbacks } from '../reader-adapter'
import type { ComicArchive } from './comic-archive'
import { deferred } from '@memorilo/effect-lifecycle/testing'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { openComicAdapter } from './comic-adapter'
import { FakeImage, installComicDom } from './comic-test-dom'

const harness = vi.hoisted(() => ({
  continuousMount: undefined as unknown as {
    close: ReturnType<typeof vi.fn>
    ensurePage: ReturnType<typeof vi.fn>
    moveViewport: ReturnType<typeof vi.fn>
    positionAt: ReturnType<typeof vi.fn>
    scrollToAnnotation: ReturnType<typeof vi.fn>
    setAnnotations: ReturnType<typeof vi.fn>
    setRegionSelectionEnabled: ReturnType<typeof vi.fn>
    setScale: ReturnType<typeof vi.fn>
  },
  continuousOpen: vi.fn(),
  openArchive: vi.fn(),
}))

vi.mock('./comic-archive', () => ({ openComicArchive: harness.openArchive }))
vi.mock('./comic-continuous-reader-mount', () => ({
  ComicContinuousReaderMount: { open: harness.continuousOpen },
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
  return {
    byteLength: 1,
    format: 'cbz' as const,
    name: 'comic.cbz',
    read: vi.fn(async () => new Uint8Array([0])),
  }
}

function archive(readPage: ComicArchive['readPage'], pageCount = 1): ComicArchive {
  return {
    close: vi.fn(async () => undefined),
    pages: Array.from({ length: pageCount }, (_, index) => ({
      byteSize: 1,
      mimeType: 'image/png',
      name: `page-${index + 1}.png`,
    })),
    readPage,
  }
}

function annotation(pageNumber: number): ReaderAnnotation {
  return {
    anchors: [{
      format: 'cbz',
      pageNumber,
      rect: { height: 0.2, width: 0.3, x: 0.1, y: 0.2 },
      type: 'region',
    }],
    annotationTopicId: `topic-${pageNumber}`,
    color: 'yellow',
    createdAt: 1,
    id: `annotation-${pageNumber}`,
    style: 'highlight',
    updatedAt: 1,
  }
}

async function closesBeforeRelease(closing: Promise<void>, release: () => void): Promise<boolean> {
  const closed = await Promise.race([
    closing.then(() => true),
    new Promise<false>(resolve => setTimeout(() => resolve(false), 50)),
  ])
  if (!closed)
    release()
  await closing
  return closed
}

beforeEach(() => {
  harness.openArchive.mockReset()
  harness.continuousMount = {
    close: vi.fn(async () => undefined),
    ensurePage: vi.fn(async () => true),
    moveViewport: vi.fn(() => 'at-boundary'),
    positionAt: vi.fn(),
    scrollToAnnotation: vi.fn(),
    setAnnotations: vi.fn(),
    setRegionSelectionEnabled: vi.fn(),
    setScale: vi.fn(),
  }
  harness.continuousOpen.mockReset()
  harness.continuousOpen.mockResolvedValue(harness.continuousMount)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('comic adapter lifecycle', () => {
  it('uses the continuous mount and restores page progress', async () => {
    const { container } = installComicDom()
    const ownedArchive = archive(vi.fn(async () => new Blob(['page'], { type: 'image/png' })), 10)
    harness.openArchive.mockResolvedValue(ownedArchive)
    const initialPosition = { format: 'cbz' as const, pageNumber: 6, pageProgress: 0.35 }
    const adapter = await openComicAdapter(source(), 'continuous', initialPosition, callbacks())

    await adapter.mount(container as unknown as HTMLElement)

    expect(harness.continuousOpen).toHaveBeenCalledWith(
      container,
      ownedArchive,
      expect.objectContaining({ initialPosition }),
    )
    expect(harness.continuousMount.positionAt).toHaveBeenCalledWith(6, 0.35)
    await adapter.destroy()
  })

  it('rejects an overlapping mount before the first page extraction settles', async () => {
    const { container } = installComicDom()
    const extraction = deferred<Blob>()
    const ownedArchive = archive(vi.fn(() => extraction.promise))
    harness.openArchive.mockResolvedValue(ownedArchive)
    const adapter = await openComicAdapter(source(), 'single-page', null, callbacks())
    const mounting = adapter.mount(container as unknown as HTMLElement)

    await expect(adapter.mount(container as unknown as HTMLElement)).rejects.toThrow(
      'Comic reader is already mounted',
    )
    extraction.resolve(new Blob(['page'], { type: 'image/png' }))
    await mounting
    await adapter.destroy()
  })

  it('cancels extraction before closing the archive', async () => {
    const { container } = installComicDom()
    const extraction = deferred<Blob>()
    let enterExtraction!: () => void
    const extractionEntered = new Promise<void>((resolve) => {
      enterExtraction = resolve
    })
    let receivedSignal: AbortSignal | undefined
    const ownedArchive = archive((
      _index: number,
      signal?: AbortSignal,
    ) => {
      enterExtraction()
      receivedSignal = signal
      signal?.addEventListener('abort', () => extraction.reject(signal.reason), { once: true })
      return extraction.promise
    })
    harness.openArchive.mockResolvedValue(ownedArchive)
    const adapter = await openComicAdapter(source(), 'single-page', null, callbacks())
    const mounting = adapter.mount(container as unknown as HTMLElement)
    await extractionEntered

    const closedBeforeExtraction = await closesBeforeRelease(
      adapter.destroy(),
      () => extraction.reject(new Error('release extraction')),
    )
    await Promise.allSettled([mounting])

    expect(closedBeforeExtraction).toBe(true)
    expect(receivedSignal).toBeInstanceOf(AbortSignal)
    expect(ownedArchive.close).toHaveBeenCalledOnce()
  })

  it('drains an extraction that ignores cancellation before releasing DOM and archive ownership', async () => {
    const { container } = installComicDom()
    const extraction = deferred<Blob>()
    const readPage = vi.fn(() => extraction.promise)
    const ownedArchive = archive(readPage)
    harness.openArchive.mockResolvedValue(ownedArchive)
    const adapter = await openComicAdapter(source(), 'single-page', null, callbacks())
    const mounting = adapter.mount(container as unknown as HTMLElement)
    await vi.waitFor(() => expect(readPage).toHaveBeenCalledOnce())

    const closing = adapter.destroy()

    expect(container.children).toHaveLength(1)
    expect(ownedArchive.close).not.toHaveBeenCalled()
    extraction.resolve(new Blob(['page'], { type: 'image/png' }))

    await expect(closing).resolves.toBeUndefined()
    await expect(mounting).resolves.toBeUndefined()
    expect(container.children).toHaveLength(0)
    expect(ownedArchive.close).toHaveBeenCalledOnce()
  })

  it('waits for image decoding before releasing archive ownership', async () => {
    const { container } = installComicDom()
    const decoding = deferred<void>()
    const decode = vi.fn(() => decoding.promise)
    vi.stubGlobal('Image', class PendingImage extends FakeImage {
      override decode(): Promise<void> {
        return decode()
      }
    })
    const ownedArchive = archive(vi.fn(async () => new Blob(['page'], { type: 'image/png' })))
    harness.openArchive.mockResolvedValue(ownedArchive)
    const adapter = await openComicAdapter(source(), 'single-page', null, callbacks())
    const mounting = adapter.mount(container as unknown as HTMLElement)
    await vi.waitFor(() => expect(decode).toHaveBeenCalledOnce())

    const closedBeforeDecode = await closesBeforeRelease(adapter.destroy(), () => decoding.resolve())
    await Promise.allSettled([mounting])

    expect(closedBeforeDecode).toBe(false)
    expect(ownedArchive.close).toHaveBeenCalledOnce()
  })

  it('does not close the archive until failed page DOM cleanup succeeds', async () => {
    const { container } = installComicDom()
    const ownedArchive = archive(vi.fn(async () => new Blob(['page'], { type: 'image/png' })))
    harness.openArchive.mockResolvedValue(ownedArchive)
    const adapter = await openComicAdapter(source(), 'single-page', null, callbacks())
    await adapter.mount(container as unknown as HTMLElement)

    const scroller = container.children[0]!
    scroller.removeFailures = 1
    await expect(adapter.destroy()).rejects.toThrow('Failed to close comic page view')
    expect(ownedArchive.close).not.toHaveBeenCalled()

    await expect(adapter.destroy()).resolves.toBeUndefined()
    expect(ownedArchive.close).toHaveBeenCalledOnce()
  })

  it('rolls back a failed mount and allows a clean retry', async () => {
    const firstReadFailure = new Error('page extraction failed')
    const readPage = vi.fn()
      .mockRejectedValueOnce(firstReadFailure)
      .mockResolvedValueOnce(new Blob(['page'], { type: 'image/png' }))
    const ownedArchive = archive(readPage)
    harness.openArchive.mockResolvedValue(ownedArchive)
    const adapter = await openComicAdapter(source(), 'single-page', null, callbacks())
    const first = installComicDom().container

    await expect(adapter.mount(first as unknown as HTMLElement)).rejects.toBe(firstReadFailure)
    expect(first.children).toHaveLength(0)

    const retry = installComicDom().container
    await expect(adapter.mount(retry as unknown as HTMLElement)).resolves.toBeUndefined()
    expect(readPage).toHaveBeenCalledTimes(2)
    await adapter.destroy()
  })

  it('uses annotations updated while the next page is decoding', async () => {
    const secondPage = deferred<Blob>()
    const readPage = vi.fn()
      .mockResolvedValueOnce(new Blob(['page-1'], { type: 'image/png' }))
      .mockImplementationOnce(() => secondPage.promise)
    const ownedArchive = archive(readPage, 2)
    harness.openArchive.mockResolvedValue(ownedArchive)
    const { container } = installComicDom()
    const adapter = await openComicAdapter(source(), 'single-page', null, callbacks())
    await adapter.mount(container as unknown as HTMLElement)

    const navigating = adapter.goForward('start')
    await vi.waitFor(() => expect(readPage).toHaveBeenCalledTimes(2))
    const latestAnnotation = annotation(2)
    adapter.setAnnotations([latestAnnotation])
    secondPage.resolve(new Blob(['page-2'], { type: 'image/png' }))
    await navigating

    expect(container.querySelector(`[data-annotation-id="${latestAnnotation.id}"]`)).not.toBeNull()
    await adapter.destroy()
  })

  it('can retry a scale after page positioning fails', async () => {
    const { container } = installComicDom()
    const readerCallbacks = callbacks()
    const ownedArchive = archive(vi.fn(async () => new Blob(['page'], { type: 'image/png' })))
    harness.openArchive.mockResolvedValue(ownedArchive)
    const adapter = await openComicAdapter(source(), 'single-page', null, readerCallbacks)
    await adapter.mount(container as unknown as HTMLElement)
    const scroller = container.children[0]!
    scroller.scrollTo = vi.fn(() => {
      throw new Error('scroll positioning failed')
    })

    await expect(adapter.setScale!(1.2)).rejects.toThrow('scroll positioning failed')
    scroller.scrollTo = vi.fn()
    await expect(adapter.setScale!(1.2)).resolves.toBeUndefined()

    expect(readerCallbacks.onStateChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ scale: 1.2 }),
    )
    await adapter.destroy()
  })

  it('aggregates construction and archive cleanup failures', async () => {
    const cleanupError = new Error('archive cleanup failed')
    const ownedArchive: ComicArchive = {
      close: vi.fn(async () => {
        throw cleanupError
      }),
      pages: [{ byteSize: 1, mimeType: 'image/png', name: 'page.png' }],
      readPage: vi.fn(async () => new Blob(['page'], { type: 'image/png' })),
    }
    harness.openArchive.mockResolvedValue(ownedArchive)

    const failure = openComicAdapter(source(), 'single-page', { format: 'pdf', pageNumber: 1, pageProgress: 0 }, callbacks())
    await expect(failure).rejects.toBeInstanceOf(AggregateError)
    const error = await failure.catch(reason => reason)
    if (!(error instanceof AggregateError))
      throw error
    expect(error.errors).toContain(cleanupError)
    expect(ownedArchive.close).toHaveBeenCalledOnce()
  })
})
