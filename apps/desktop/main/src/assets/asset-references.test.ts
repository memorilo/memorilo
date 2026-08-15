import type { BookFileBinding } from '@memorilo/reading-model'
import { createEditorNote } from '@memorilo/editor/note'
import { describe, expect, it } from 'vitest'
import { projectNoteAssetReferences } from './asset-references'

describe('note asset references', () => {
  it('counts Reader region snapshots stored on annotation Topics', () => {
    const note = createEditorNote({ id: 'reader-source-assets', title: 'Reader source assets' })
    const root = note.getEntries()[0]
    if (!root || root.kind !== 'topic')
      throw new Error('Expected the initial Topic')
    const fileName = '123e4567-e89b-42d3-a456-426614174000.png'
    note.createTopic({
      mode: 0,
      parentId: root.id,
      readerReference: {
        source: {
          imageSrc: `memorilo-asset:///${fileName}`,
          kind: 'region',
          location: 'Page 2',
        },
      },
      title: 'Region annotation',
    })

    expect(projectNoteAssetReferences(note)).toEqual([{ count: 1, fileName }])
  })

  it('counts the immutable snapshot owned by a Reader region ImageOcclusionTopic', async () => {
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
    const note = createEditorNote({
      id: 'reader-occlusion-assets',
      initialBookTopic: { book, mode: 0, title: 'Book context' },
    })
    const [bookTopic] = note.getEntries()
    if (!bookTopic || bookTopic.kind !== 'topic' || bookTopic.topicType !== 'book')
      throw new Error('Expected the initial BookTopic')
    const annotation = {
      anchors: [{ end: 20, format: 'txt' as const, start: 10, type: 'region' as const }] as const,
      color: 'yellow' as const,
      createdAt: 1,
      id: 'region-annotation',
      style: 'highlight' as const,
      updatedAt: 1,
    }
    note.getBookTopic(bookTopic.id).setAnnotations([annotation])
    const fileName = '223e4567-e89b-42d3-a456-426614174000.png'
    await note.createImageOcclusionTopic({
      snapshot: async () => ({
        height: 300,
        src: `memorilo-asset:///${fileName}`,
        width: 400,
      }),
      source: {
        annotationId: annotation.id,
        kind: 'reader-region',
        topicId: bookTopic.id,
      },
      title: 'Image occlusion',
    })

    expect(projectNoteAssetReferences(note)).toEqual([{ count: 1, fileName }])
  })
})
