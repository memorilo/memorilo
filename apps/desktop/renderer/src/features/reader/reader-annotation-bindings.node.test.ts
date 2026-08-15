import type { ReaderAnnotation } from '@memorilo/editor/reader'
import type { BookFileBinding } from '@memorilo/reading-model'
import { createEditorNote } from '@memorilo/editor/note'
import { describe, expect, it } from 'vitest'
import {
  prepareReaderAnnotationTopicsForDeletion,
  readerAnnotationDependents,
  reconciledReaderAnnotations,
} from './reader-annotation-bindings'

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

describe('reader annotation Topic bindings', () => {
  it('detaches a persisted annotation before rendering when its Topic source was removed', () => {
    const note = createEditorNote({
      id: 'binding-note',
      initialBookTopic: { book, mode: 0, title: 'Book context' },
    })
    const [bookTopic] = note.getEntries()
    if (!bookTopic || bookTopic.kind !== 'topic' || bookTopic.topicType !== 'book')
      throw new Error('Expected the initial BookTopic')
    note.getBookTopic(bookTopic.id).setAnnotations([{
      anchor: {
        end: 13,
        format: 'txt',
        quote: { exact: 'Selected text' },
        start: 0,
        type: 'text',
      },
      color: 'yellow',
      createdAt: 1,
      id: 'annotation-1',
      style: 'highlight',
      updatedAt: 1,
    }])
    const annotationTopicId = note.createTopic({
      mode: 0,
      parentId: bookTopic.id,
      readerReference: {
        annotationId: 'annotation-1',
        bookTopicId: bookTopic.id,
        source: { kind: 'text', location: 'Page 1', text: 'Selected text' },
      },
      title: 'Selected text',
    })
    note.setTopicReaderReference(annotationTopicId, null)
    const annotation: ReaderAnnotation = {
      anchor: {
        end: 13,
        format: 'txt',
        quote: { exact: 'Selected text' },
        start: 0,
        type: 'text',
      },
      annotationTopicId,
      color: 'yellow',
      createdAt: 1,
      id: 'annotation-1',
      style: 'highlight',
      updatedAt: 1,
    }

    const { annotationTopicId: _annotationTopicId, ...detached } = annotation
    expect(reconciledReaderAnnotations(note, bookTopic.id, [annotation])).toEqual([detached])
  })

  it('detaches the annotation Topic and keeps the image occlusion Topic when the highlight is deleted', async () => {
    const note = createEditorNote({
      id: 'binding-dependents-note',
      initialBookTopic: { book, mode: 0, title: 'Book context' },
    })
    const [bookTopicEntry] = note.getEntries()
    if (!bookTopicEntry || bookTopicEntry.kind !== 'topic' || bookTopicEntry.topicType !== 'book')
      throw new Error('Expected the initial BookTopic')
    const annotation: ReaderAnnotation = {
      anchor: { end: 20, format: 'txt', start: 10, type: 'region' },
      color: 'yellow',
      createdAt: 1,
      id: 'annotation-region',
      style: 'highlight',
      updatedAt: 1,
    }
    note.getBookTopic(bookTopicEntry.id).setAnnotations([annotation])
    const annotationTopicId = note.createTopic({
      mode: 0,
      parentId: bookTopicEntry.id,
      readerReference: {
        annotationId: annotation.id,
        bookTopicId: bookTopicEntry.id,
        source: {
          imageSrc: 'memorilo-asset:///123e4567-e89b-42d3-a456-426614174000.png',
          kind: 'region',
          location: 'Selection 10-20',
        },
      },
      title: 'Region annotation',
    })
    const linkedAnnotation = { ...annotation, annotationTopicId }
    const imageOcclusionTopicId = await note.createImageOcclusionTopic({
      snapshot: async () => ({
        height: 300,
        src: 'memorilo-asset:///223e4567-e89b-42d3-a456-426614174000.png',
        width: 400,
      }),
      source: {
        annotationId: annotation.id,
        kind: 'reader-region',
        topicId: bookTopicEntry.id,
      },
      title: 'Image occlusion',
    })

    expect(readerAnnotationDependents(note, bookTopicEntry.id, linkedAnnotation)).toEqual({
      annotationTopicId,
      imageOcclusionTopicIds: [imageOcclusionTopicId],
    })

    prepareReaderAnnotationTopicsForDeletion(note, bookTopicEntry.id, linkedAnnotation)
    expect(note.getTopicReaderReference(annotationTopicId)).toEqual({
      source: {
        imageSrc: 'memorilo-asset:///123e4567-e89b-42d3-a456-426614174000.png',
        kind: 'region',
        location: 'Selection 10-20',
      },
    })
    expect(note.getImageOcclusionTopic(imageOcclusionTopicId).getState().source).toEqual({
      annotationId: annotation.id,
      kind: 'reader-region',
      topicId: bookTopicEntry.id,
    })

    expect(note.getEntries().map(entry => entry.id)).toEqual([
      bookTopicEntry.id,
      annotationTopicId,
      imageOcclusionTopicId,
    ])
  })
})
