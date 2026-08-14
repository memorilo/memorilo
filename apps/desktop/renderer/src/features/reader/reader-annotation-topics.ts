import type { DesktopApi } from '@memorilo/desktop-preload'
import type { CreateTopicInput } from '@memorilo/editor/note'
import type {
  ReaderAnnotationTopicCreateInput,
  ReaderClientRect,
} from '@memorilo/editor/reader'

interface ReaderViewport {
  height: number
  width: number
}

interface CreateReaderAnnotationTopicOptions {
  bookTopicId: string
  captureReaderRegion: DesktopApi['captureReaderRegion']
  createTopic: (input: CreateTopicInput) => string
  input: ReaderAnnotationTopicCreateInput
  saveImage: DesktopApi['saveImage']
  signal: AbortSignal
  viewport: ReaderViewport
}

function annotationTopicTitle(input: ReaderAnnotationTopicCreateInput): string {
  if (input.annotation.anchor.type === 'region')
    return input.location
  const text = input.annotation.anchor.quote.exact.trim().replace(/\s+/gu, ' ')
  return text.length > 80 ? `${text.slice(0, 77)}...` : text
}

function captureRegion(input: ReaderClientRect, viewport: ReaderViewport) {
  const x = Math.max(0, Math.floor(input.left))
  const y = Math.max(0, Math.floor(input.top))
  const right = Math.min(viewport.width, Math.ceil(input.left + input.width))
  const bottom = Math.min(viewport.height, Math.ceil(input.top + input.height))
  if (right <= x || bottom <= y)
    throw new RangeError('Reader annotation region is outside the visible window')
  return { height: bottom - y, width: right - x, x, y }
}

export async function createReaderAnnotationTopic({
  bookTopicId,
  captureReaderRegion,
  createTopic,
  input,
  saveImage,
  signal,
  viewport,
}: CreateReaderAnnotationTopicOptions): Promise<string> {
  signal.throwIfAborted()
  let source: CreateTopicInput['readerReference']
  if (input.annotation.anchor.type === 'text') {
    source = {
      annotationId: input.annotation.id,
      bookTopicId,
      source: {
        kind: 'text',
        location: input.location,
        text: input.annotation.anchor.quote.exact,
      },
    }
  }
  else {
    const png = await captureReaderRegion(captureRegion(input.clientRect, viewport))
    signal.throwIfAborted()
    const saved = await saveImage({
      data: png,
      fileName: `reader-region-${input.annotation.id}.png`,
      mimeType: 'image/png',
    })
    signal.throwIfAborted()
    source = {
      annotationId: input.annotation.id,
      bookTopicId,
      source: { imageSrc: saved.src, kind: 'region', location: input.location },
    }
  }
  signal.throwIfAborted()
  return createTopic({
    mode: 0,
    parentId: bookTopicId,
    readerReference: source,
    title: annotationTopicTitle(input),
  })
}
