import type { ReaderAnnotation } from '@memorilo/editor/reader'
import type { BookFileBinding } from '@memorilo/reading-model'
import { createEditorNote } from '@memorilo/editor/note'
import { describe, expect, it } from 'vitest'
import { reconciledReaderAnnotations } from './reader-annotation-bindings'

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
})
