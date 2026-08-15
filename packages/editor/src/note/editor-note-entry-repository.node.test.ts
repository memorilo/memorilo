import type { ReadingAnnotation } from '@memorilo/reading-model'
import { describe, expect, it } from 'vitest'
import { EditorMode } from '../common/editor-mode'
import { createEditorNote } from './editor-note'

const readerAnnotation: ReadingAnnotation = {
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
}

describe('editor Note entry repository', () => {
  it('keeps tree ownership coherent across promote, move, rename, and subtree deletion', () => {
    const note = createEditorNote({ id: 'entry-note' })
    const folderId = note.createFolder({ index: 0, name: 'Drafts' })
    const promotedTopicId = note.createTopic({
      mode: EditorMode.Document,
      parentId: folderId,
      title: 'Promote me',
    })

    note.renameEntry(folderId, 'Research')
    note.renameEntry(promotedTopicId, 'Promoted')
    note.deleteEntry({ entryId: folderId, strategy: 'promote-children' })

    expect(note.getEntries()).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: promotedTopicId, parentId: null, title: 'Promoted' }),
    ]))

    const removableFolderId = note.createFolder({ name: 'Remove' })
    const removableTopicId = note.createTopic({
      mode: EditorMode.Outline,
      parentId: removableFolderId,
      title: 'Remove me',
    })
    note.moveEntry({ entryId: promotedTopicId, index: 0, parentId: removableFolderId })
    expect(note.getEntries()).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: promotedTopicId, ordinal: 0, parentId: removableFolderId }),
      expect.objectContaining({ id: removableTopicId, ordinal: 1, parentId: removableFolderId }),
    ]))

    note.deleteEntry({ entryId: removableFolderId, strategy: 'delete-subtree' })
    const remainingIds = note.getEntries().map(entry => entry.id)
    expect(remainingIds).not.toContain(promotedTopicId)
    expect(remainingIds).not.toContain(removableTopicId)
  })

  it('does not publish partial CRDT state when an entry mutation fails validation', () => {
    const note = createEditorNote({ id: 'atomic-entry-note' })
    const beforeEntries = note.getEntries()
    const beforeVersion = note.getVersion()

    expect(() => note.createFolder({ index: -1, name: 'Invalid' })).toThrow('non-negative integer')
    expect(() => note.createFolder({ name: '  ' })).toThrow('non-empty string')

    expect(note.getEntries()).toEqual(beforeEntries)
    expect(note.getVersion()).toEqual(beforeVersion)
  })

  it('keeps a Reader-bound Topic directly under its BookTopic', () => {
    const note = createEditorNote({
      id: 'bound-entry-note',
      initialBookTopic: {
        book: {
          book: { authors: ['Author'], title: 'Publication' },
          file: {
            byteLength: 42,
            format: 'txt',
            originalName: 'publication.txt',
            sha256: 'a'.repeat(64),
          },
          retrievalHints: [{ kind: 'local', readingId: 'reading-1' }],
        },
        mode: EditorMode.Document,
        title: 'Book context',
      },
    })
    const [bookTopic] = note.getEntries()
    if (!bookTopic || bookTopic.kind !== 'topic' || bookTopic.topicType !== 'book')
      throw new Error('Expected the initial BookTopic')
    note.getBookTopic(bookTopic.id).setAnnotations([readerAnnotation])
    const folderId = note.createFolder({ name: 'Other' })
    const readerReference = {
      annotationId: 'annotation-1',
      bookTopicId: bookTopic.id,
      source: { kind: 'text' as const, location: 'Page 1', text: 'Selected text' },
    }
    expect(() => note.createTopic({
      mode: EditorMode.Document,
      parentId: folderId,
      readerReference,
      title: 'Invalid source parent',
    })).toThrow('Reader-bound Topic')
    const detachedTopicId = note.createTopic({
      mode: EditorMode.Document,
      parentId: folderId,
      title: 'Detached',
    })
    expect(() => note.setTopicReaderReference(detachedTopicId, readerReference)).toThrow('Reader-bound Topic')
    const topicId = note.createTopic({
      mode: EditorMode.Document,
      parentId: bookTopic.id,
      readerReference,
      title: 'Selected text',
    })

    expect(() => note.moveEntry({ entryId: topicId, parentId: folderId })).toThrow(
      'Reader-bound Topic',
    )
    expect(() => note.deleteEntry({ entryId: bookTopic.id, strategy: 'promote-children' })).toThrow(
      'Reader-bound Topic',
    )
    expect(note.getEntries().find(entry => entry.id === topicId)).toMatchObject({
      parentId: bookTopic.id,
      readerReference: { bookTopicId: bookTopic.id },
    })
  })

  it('requires an existing Reader annotation and rejects duplicate Topic bindings', () => {
    const note = createEditorNote({
      id: 'reader-binding-invariants-note',
      initialBookTopic: {
        book: {
          book: { authors: ['Author'], title: 'Publication' },
          file: {
            byteLength: 42,
            format: 'txt',
            originalName: 'publication.txt',
            sha256: 'a'.repeat(64),
          },
          retrievalHints: [{ kind: 'local', readingId: 'reading-1' }],
        },
        mode: EditorMode.Document,
        title: 'Book context',
      },
    })
    const [bookTopic] = note.getEntries()
    if (!bookTopic || bookTopic.kind !== 'topic' || bookTopic.topicType !== 'book')
      throw new Error('Expected the initial BookTopic')
    const reference = {
      annotationId: readerAnnotation.id,
      bookTopicId: bookTopic.id,
      source: { kind: 'text' as const, location: 'Page 1', text: 'Selected text' },
    }

    expect(() => note.createTopic({
      mode: EditorMode.Document,
      parentId: bookTopic.id,
      readerReference: reference,
      title: 'Missing annotation',
    })).toThrow('does not contain Reader annotation')

    note.getBookTopic(bookTopic.id).setAnnotations([readerAnnotation])
    const firstTopicId = note.createTopic({
      mode: EditorMode.Document,
      parentId: bookTopic.id,
      readerReference: reference,
      title: 'Selected text',
    })
    expect(() => note.getBookTopic(bookTopic.id).setAnnotations([])).toThrow(
      'cannot remove Reader annotation',
    )
    expect(() => note.createTopic({
      mode: EditorMode.Document,
      parentId: bookTopic.id,
      readerReference: reference,
      title: 'Duplicate binding',
    })).toThrow('already binds Reader annotation')

    const detachedTopicId = note.createTopic({
      mode: EditorMode.Document,
      parentId: bookTopic.id,
      title: 'Detached',
    })
    expect(() => note.setTopicReaderReference(detachedTopicId, reference)).toThrow('already binds Reader annotation')
    expect(note.getTopicReaderReference(firstTopicId)).toEqual(reference)
  })
})
