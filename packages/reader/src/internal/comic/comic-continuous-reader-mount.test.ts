import type { ReaderAnnotation } from '../../types'
import type { ReaderAdapterCallbacks } from '../reader-adapter'
import type { ComicArchive } from './comic-archive'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ComicContinuousReaderMount } from './comic-continuous-reader-mount'
import { installComicDom } from './comic-test-dom'

vi.mock('../region-selection.stylex', () => ({
  regionSelectionClassNames: {
    annotation: 'annotation',
    annotations: 'annotations',
    capture: 'capture',
    captureActive: 'capture-active',
    draft: 'draft',
  },
}))

function annotation(): ReaderAnnotation {
  return {
    anchors: [{
      format: 'cbz',
      pageNumber: 1,
      rect: { height: 0.2, width: 0.3, x: 0.1, y: 0.2 },
      type: 'region',
    }],
    color: 'yellow',
    createdAt: 1,
    id: 'annotation-1',
    style: 'highlight',
    updatedAt: 1,
  }
}

function callbacks(label: () => string): ReaderAdapterCallbacks {
  return {
    onAnnotationActivate: vi.fn(),
    onError: vi.fn(),
    onKeyDown: vi.fn(() => false),
    onOcrStatusChange: vi.fn(),
    onRegionSelectionModeChange: vi.fn(),
    onSelectionChange: vi.fn(),
    onStateChange: vi.fn(),
    regionAnnotationLabel: label,
  }
}

function archive(): ComicArchive {
  return {
    close: vi.fn(async () => undefined),
    pages: [{ byteSize: 1, mimeType: 'image/png', name: 'page.png' }],
    readPage: vi.fn(async () => new Blob(['page'], { type: 'image/png' })),
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('continuous comic reader mount', () => {
  it('releases a staged page object URL exactly once when page setup fails', async () => {
    const { container, revoke } = installComicDom()
    vi.stubGlobal('IntersectionObserver', class FakeIntersectionObserver {
      disconnect(): void {}
      observe(): void {}
    })
    const failure = new Error('annotation label failed')

    await expect(ComicContinuousReaderMount.open(
      container as unknown as HTMLElement,
      archive(),
      {
        annotations: [annotation()],
        callbacks: callbacks(() => { throw failure }),
        format: 'cbz',
        initialPosition: { format: 'cbz', pageNumber: 1, pageProgress: 0 },
        name: 'Comic',
        onPositionChange: vi.fn(),
        onRegionSelection: vi.fn(),
        scale: 1,
        signal: new AbortController().signal,
      },
    )).rejects.toBe(failure)

    expect(revoke).toHaveBeenCalledExactlyOnceWith('blob:comic-1')
    expect(container.children).toHaveLength(0)
  })
})
