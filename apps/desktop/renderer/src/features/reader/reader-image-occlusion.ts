import type { DesktopApi } from '@memorilo/desktop-preload'
import type { EditorNote, ImageOcclusionSnapshot } from '@memorilo/editor'
import type { ReaderAnnotationTopicCreateInput } from '@memorilo/editor/reader'
import type { ReaderViewport } from './reader-annotation-topics'
import type { ReaderCaptureRegion } from './reader-capture'
import { readerCaptureRegion } from './reader-annotation-topics'

interface ImageSize {
  height: number
  width: number
}

interface OpenReaderRegionImageOcclusionOptions {
  bookTopicId: string
  captureReaderRegion: (region: ReaderCaptureRegion) => Promise<Uint8Array>
  input: ReaderAnnotationTopicCreateInput
  note: Pick<EditorNote, 'createImageOcclusionTopic' | 'findImageOcclusionTopic'>
  readImageSize: (src: string) => Promise<ImageSize>
  saveImage: DesktopApi['saveImage']
  signal: AbortSignal
  title: string
  viewport: ReaderViewport
}

export function readReaderImageSize(src: string): Promise<ImageSize> {
  return new Promise((resolve, reject) => {
    const image = new window.Image()
    image.onload = () => {
      if (image.naturalWidth <= 0 || image.naturalHeight <= 0) {
        reject(new Error(`Reader image occlusion snapshot ${src} has invalid dimensions`))
        return
      }
      resolve({ height: image.naturalHeight, width: image.naturalWidth })
    }
    image.onerror = () => reject(new Error(`Failed to load Reader image occlusion snapshot ${src}`))
    image.src = src
  })
}

export async function openReaderRegionImageOcclusion({
  bookTopicId,
  captureReaderRegion,
  input,
  note,
  readImageSize,
  saveImage,
  signal,
  title,
  viewport,
}: OpenReaderRegionImageOcclusionOptions): Promise<string> {
  if (input.annotation.anchor.type !== 'region')
    throw new TypeError(`Reader annotation ${input.annotation.id} is not a region`)
  const source = {
    annotationId: input.annotation.id,
    kind: 'reader-region' as const,
    topicId: bookTopicId,
  }
  signal.throwIfAborted()
  const existing = note.findImageOcclusionTopic(source)
  if (existing)
    return existing.topicId

  return note.createImageOcclusionTopic({
    snapshot: async (resolved): Promise<ImageOcclusionSnapshot> => {
      if (resolved.kind !== 'reader-region'
        || resolved.topicId !== bookTopicId
        || resolved.annotationId !== input.annotation.id) {
        throw new TypeError('Resolved Reader region source does not match the requested annotation')
      }
      signal.throwIfAborted()
      const png = await captureReaderRegion(readerCaptureRegion(input.clientRect, viewport))
      signal.throwIfAborted()
      const saved = await saveImage({
        data: png,
        fileName: `reader-region-occlusion-${input.annotation.id}.png`,
        mimeType: 'image/png',
      })
      signal.throwIfAborted()
      const size = await readImageSize(saved.src)
      signal.throwIfAborted()
      return { ...size, src: saved.src }
    },
    source,
    title,
  })
}
