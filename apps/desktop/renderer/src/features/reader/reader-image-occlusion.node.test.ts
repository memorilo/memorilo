import type { ReaderAnnotation, ReaderAnnotationTopicCreateInput } from '@memorilo/editor/reader'
import type { BookFileBinding } from '@memorilo/reading-model'
import { createEditorNote } from '@memorilo/editor/note'
import { describe, expect, it, vi } from 'vitest'
import { openReaderRegionImageOcclusion } from './reader-image-occlusion'

const book: BookFileBinding = {
  book: { authors: ['Author'], title: 'Publication' },
  file: {
    byteLength: 42,
    format: 'txt',
    originalName: 'publication.txt',
    sha256: 'a'.repeat(64),
  },
  retrievalHints: [{ kind: 'local', readingId: 'reading-1' }],
}

describe('reader region image occlusion', () => {
  it('captures one immutable snapshot and reopens the BookTopic child on later requests', async () => {
    const note = createEditorNote({
      id: 'reader-image-occlusion-note',
      initialBookTopic: { book, mode: 0, title: 'Book context' },
    })
    const [bookTopicEntry] = note.getEntries()
    if (!bookTopicEntry || bookTopicEntry.kind !== 'topic' || bookTopicEntry.topicType !== 'book')
      throw new Error('Expected the initial BookTopic')
    const annotation: ReaderAnnotation = {
      anchors: [{ end: 20, format: 'txt' as const, start: 10, type: 'region' as const }],
      color: 'yellow' as const,
      createdAt: 1,
      id: 'region-annotation',
      style: 'highlight' as const,
      updatedAt: 1,
    }
    note.getBookTopic(bookTopicEntry.id).setAnnotations([annotation])
    const input: ReaderAnnotationTopicCreateInput = {
      annotation,
      clientRect: { height: 80, left: 20, top: 30, width: 120 },
      location: 'Selection 10-20',
    }
    const captureReaderRegion = vi.fn(async () => Uint8Array.from([137, 80, 78, 71]))
    const saveImage = vi.fn(async () => ({
      src: 'memorilo-asset:///123e4567-e89b-42d3-a456-426614174000.png',
    }))
    const readImageSize = vi.fn(async () => ({ height: 160, width: 240 }))
    const options = {
      bookTopicId: bookTopicEntry.id,
      captureReaderRegion,
      input,
      note,
      readImageSize,
      saveImage,
      signal: new AbortController().signal,
      title: 'Image occlusion',
      viewport: { height: 600, width: 800 },
    }

    const createdId = await openReaderRegionImageOcclusion(options)
    const reopenedId = await openReaderRegionImageOcclusion(options)

    expect(reopenedId).toBe(createdId)
    expect(captureReaderRegion).toHaveBeenCalledTimes(1)
    expect(captureReaderRegion).toHaveBeenCalledWith(
      { height: 80, width: 120, x: 20, y: 30 },
    )
    expect(saveImage).toHaveBeenCalledTimes(1)
    expect(readImageSize).toHaveBeenCalledWith('memorilo-asset:///123e4567-e89b-42d3-a456-426614174000.png')
    expect(note.getEntries().find(entry => entry.id === createdId)).toMatchObject({
      parentId: bookTopicEntry.id,
      topicType: 'image-occlusion',
    })
    expect(note.getImageOcclusionTopic(createdId).getState()).toMatchObject({
      image: {
        height: 160,
        src: 'memorilo-asset:///123e4567-e89b-42d3-a456-426614174000.png',
        width: 240,
      },
      source: {
        annotationId: annotation.id,
        kind: 'reader-region',
        topicId: bookTopicEntry.id,
      },
    })
  })
})
