import type { BookFileBinding, ReadingAnnotation } from '@memorilo/reading-model'
import { Effect } from 'effect'
import { describe, expect, it } from 'vitest'
import { EditorMode } from '../common/editor-mode'
import { createEditorNote, resolveEditorTopicBinding } from './editor-note'

const book: BookFileBinding = {
  book: { authors: ['Ursula K. Le Guin'], title: 'The Dispossessed' },
  file: {
    byteLength: 42,
    format: 'epub',
    originalName: 'the-dispossessed.epub',
    sha256: 'a'.repeat(64),
  },
  retrievalHints: [{ kind: 'local', readingId: 'reading-1' }],
}

describe('editor note topic creation', () => {
  it('creates a canonical empty Topic or derives its title from an initial heading', () => {
    const empty = createEditorNote({ id: 'empty-note' })
    const [emptyTopic] = empty.getEntries()
    expect(emptyTopic).toMatchObject({ kind: 'topic', title: '', topicType: 'regular' })
    expect(empty.hasUserContent()).toBe(false)

    const headed = createEditorNote({ id: 'headed-note', initialTopicHeading: 'First thought' })
    const [headedTopic] = headed.getEntries()
    expect(headedTopic).toMatchObject({ kind: 'topic', title: 'First thought', topicType: 'regular' })
    expect(headed.hasUserContent()).toBe(true)
  })

  it('atomically initializes a custom regular Topic before edit history begins', () => {
    const note = createEditorNote({
      id: 'custom-topic-note',
      initialTopic: {
        initialContent: {
          content: [{
            attrs: { blockId: 'initial-block', checked: false, collapsed: false, kind: 'outline', order: null },
            content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Initial content' }] }],
            type: 'list',
          }],
          type: 'doc',
        },
        mode: EditorMode.Outline,
        title: 'Initial Topic',
      },
    })
    const [entry] = note.getEntries()
    expect(entry).toMatchObject({ kind: 'topic', mode: EditorMode.Outline, title: 'Initial Topic' })
    if (!entry || entry.kind !== 'topic')
      throw new Error('Expected the initial Topic')
    expect(note.getTopicContent(entry.id).blocks).toMatchObject([{ id: 'initial-block', text: 'Initial content' }])
    expect(resolveEditorTopicBinding(note.getTopic(entry.id)).undoManager.canUndo()).toBe(false)
  })

  it('binds Topic documents to their owning CRDT tree and shared editor mode', () => {
    const note = createEditorNote({ id: 'bound-note' })
    const [entry] = note.getEntries()
    if (!entry || entry.kind !== 'topic')
      throw new Error('Expected the initial Topic')

    const document = note.getTopic(entry.id)
    const binding = resolveEditorTopicBinding(document)
    expect(binding.doc).toBeDefined()
    expect(binding.topicId).toBe(entry.id)
    expect(binding.tree.toJSON()).toBeDefined()
    expect(document.getMode()).toBe(EditorMode.Document)
    document.setMode(EditorMode.Outline)
    expect(note.getTopic(entry.id).getMode()).toBe(EditorMode.Outline)
  })

  it('initializes and restores every BookTopic-owned container', async () => {
    const note = createEditorNote({
      id: 'book-note',
      initialBookTopic: {
        book,
        mode: EditorMode.Document,
        title: 'An Ambiguous Utopia',
      },
    })
    const [entry] = note.getEntries()
    if (!entry || entry.kind !== 'topic')
      throw new Error('Expected the initial BookTopic')

    expect(entry).toMatchObject({ book, title: 'An Ambiguous Utopia', topicType: 'book' })
    expect(note.getBookTopic(entry.id).getReadingState()).toEqual({ annotations: [], position: null })
    await expect(Effect.runPromise(note.validateTopic(entry.id))).resolves.toMatchObject({
      annotations: {},
      readingState: { position: null },
    })

    const restored = createEditorNote({ id: note.id, snapshot: note.exportSnapshot() })
    expect(restored.getEntries()).toEqual(note.getEntries())
    expect(restored.getBookTopic(entry.id).getReadingState()).toEqual({ annotations: [], position: null })
  })

  it('rejects corrupt restored metadata and Topic ownership before returning a Note', () => {
    const wrongId = createEditorNote({ id: 'stored-note' })
    const [wrongIdTopic] = wrongId.getEntries()
    if (!wrongIdTopic || wrongIdTopic.kind !== 'topic')
      throw new Error('Expected the stored Topic')
    const wrongIdBinding = resolveEditorTopicBinding(wrongId.getTopic(wrongIdTopic.id))
    wrongIdBinding.doc.getMap('noteMeta').set('id', 'another-note')
    wrongIdBinding.doc.commit({ origin: 'test:corrupt-note-id' })

    expect(() => createEditorNote({
      id: 'stored-note',
      snapshot: wrongId.exportSnapshot(),
    })).toThrow('does not match requested Note')

    const missingDocument = createEditorNote({ id: 'missing-document-note' })
    const [missingDocumentTopic] = missingDocument.getEntries()
    if (!missingDocumentTopic || missingDocumentTopic.kind !== 'topic')
      throw new Error('Expected the stored Topic')
    const missingDocumentBinding = resolveEditorTopicBinding(missingDocument.getTopic(missingDocumentTopic.id))
    const [entryNode] = missingDocumentBinding.doc.getTree('entries').getNodes()
    if (!entryNode)
      throw new Error('Expected the stored Topic node')
    entryNode.data.set('blockTreeKey', 'topic:missing:blocks')
    missingDocumentBinding.doc.commit({ origin: 'test:corrupt-topic-tree' })

    expect(() => createEditorNote({
      id: missingDocument.id,
      snapshot: missingDocument.exportSnapshot(),
    })).toThrow('does not contain an initialized document')
  })

  it('rejects invalid and duplicate Topics before publishing partial CRDT state', () => {
    const note = createEditorNote({
      id: 'atomic-note',
      initialBookTopic: {
        book,
        mode: EditorMode.Document,
        title: 'An Ambiguous Utopia',
      },
    })
    const beforeEntries = note.getEntries()
    const beforeVersion = note.getVersion()

    expect(() => note.createBookTopic({
      book: structuredClone(book),
      mode: EditorMode.Document,
      title: 'Duplicate',
    })).toThrow('already contains BookTopic')
    expect(() => note.createTopic({
      initialContent: { content: [{ text: 'orphaned inline content', type: 'text' }], type: 'doc' },
      mode: EditorMode.Document,
      title: 'Invalid',
    })).toThrow()

    expect(note.getEntries()).toEqual(beforeEntries)
    expect(note.getVersion()).toEqual(beforeVersion)
  })

  it('creates an ImageOcclusionTopic from the authoritative source image snapshot', async () => {
    const note = createEditorNote({ id: 'image-occlusion-note' })
    const [sourceTopic] = note.getEntries()
    if (!sourceTopic || sourceTopic.kind !== 'topic')
      throw new Error('Expected the source Topic')
    const sourceDocument = note.getTopicValidationInput(sourceTopic.id)
    if (!('document' in sourceDocument))
      throw new TypeError('Expected a RegularTopic document')
    const sourceBlockId = sourceDocument.document.content?.[0]?.attrs?.blockId
    if (typeof sourceBlockId !== 'string')
      throw new Error('Expected the source Block ID')
    const sourceImage = { height: 599.25, src: 'https://example.com/source.png', width: 799.5 }
    note.applyTopicBlockEdits({
      edits: [{
        blockId: sourceBlockId,
        content: [{ type: 'image', attrs: { ...sourceImage, imageId: 'source-image' } }],
        operation: 'update-block-content',
      }],
      topicId: sourceTopic.id,
    })
    const capturedSources: unknown[] = []
    const storedSnapshot = { height: 600, src: 'memorilo-asset:/snapshot.png', width: 800 }

    const topicId = await note.createImageOcclusionTopic({
      snapshot: async (source) => {
        capturedSources.push(source)
        return storedSnapshot
      },
      sourceImageId: 'source-image',
      sourceTopicId: sourceTopic.id,
      title: 'Image Occlusion',
    })

    expect(capturedSources).toEqual([{ src: sourceImage.src }])
    expect(note.getImageOcclusionTopic(topicId).getState().image).toEqual(storedSnapshot)
    expect(note.getTopicValidationInput(topicId).entry).not.toHaveProperty('editorMode')
  })

  it('rejects an invalid ImageOcclusionTopic snapshot without publishing partial state', async () => {
    const note = createEditorNote({ id: 'invalid-image-occlusion-note' })
    const [sourceTopic] = note.getEntries()
    if (!sourceTopic || sourceTopic.kind !== 'topic')
      throw new Error('Expected the source Topic')
    const sourceDocument = note.getTopicValidationInput(sourceTopic.id)
    if (!('document' in sourceDocument))
      throw new TypeError('Expected a RegularTopic document')
    const sourceBlockId = sourceDocument.document.content?.[0]?.attrs?.blockId
    if (typeof sourceBlockId !== 'string')
      throw new Error('Expected the source Block ID')
    note.applyTopicBlockEdits({
      edits: [{
        blockId: sourceBlockId,
        content: [{
          type: 'image',
          attrs: { height: 600, imageId: 'source-image', src: 'https://example.com/source.png', width: 800 },
        }],
        operation: 'update-block-content',
      }],
      topicId: sourceTopic.id,
    })

    await expect(note.createImageOcclusionTopic({
      snapshot: async () => ({ height: 0.5, src: 'memorilo-asset:/wrong.png', width: 1 }),
      sourceImageId: 'source-image',
      sourceTopicId: sourceTopic.id,
      title: 'Image Occlusion',
    })).rejects.toThrow(/height/u)
    expect(note.getEntries()).toHaveLength(1)
  })

  it('records a Note rename as one undo step', () => {
    const note = createEditorNote({ id: 'rename-note', title: 'Before' })
    const [entry] = note.getEntries()
    if (!entry || entry.kind !== 'topic')
      throw new Error('Expected the initial Topic')
    const undoManager = resolveEditorTopicBinding(note.getTopic(entry.id)).undoManager
    undoManager.clear()

    note.renameNote('After')

    expect(note.getTitle()).toBe('After')
    expect(undoManager.canUndo()).toBe(true)
    expect(undoManager.undo()).toBe(true)
    expect(note.getTitle()).toBe('Before')
    expect(undoManager.canUndo()).toBe(false)
  })

  it('validates BookTopic reading mutations before changing owned containers', () => {
    const note = createEditorNote({
      id: 'reading-note',
      initialBookTopic: { book, mode: EditorMode.Document, title: 'An Ambiguous Utopia' },
    })
    const [entry] = note.getEntries()
    if (!entry || entry.kind !== 'topic')
      throw new Error('Expected the initial BookTopic')
    const document = note.getBookTopic(entry.id)
    const annotation: ReadingAnnotation = {
      anchor: {
        format: 'epub',
        locator: { href: 'chapter-1.xhtml', type: 'application/xhtml+xml' },
        quote: { exact: 'There was a wall.' },
        type: 'text',
      },
      color: 'yellow',
      createdAt: 1,
      id: 'annotation-1',
      kind: 'highlight',
      updatedAt: 1,
    }

    document.setPosition({
      format: 'epub',
      locator: { href: 'chapter-1.xhtml', type: 'application/xhtml+xml' },
    })
    document.setAnnotations([annotation])
    expect(document.getReadingState()).toEqual({
      annotations: [annotation],
      position: {
        format: 'epub',
        locator: { href: 'chapter-1.xhtml', type: 'application/xhtml+xml' },
      },
    })

    expect(() => document.setPosition({ format: 'pdf', pageNumber: 1 })).toThrow()
    expect(() => document.setAnnotations([annotation, annotation])).toThrow('Duplicate BookTopic annotation id')
    expect(document.getReadingState().annotations).toEqual([annotation])

    const rebound: BookFileBinding = {
      ...book,
      file: { ...book.file, originalName: 'the-dispossessed-copy.epub', sha256: 'b'.repeat(64) },
    }
    document.rebind(rebound)
    expect(document.getBook()).toEqual(rebound)
    expect(() => document.rebind({
      ...rebound,
      file: { ...rebound.file, format: 'pdf', originalName: 'the-dispossessed.pdf' },
    })).toThrow('cannot change format')
    expect(document.getBook()).toEqual(rebound)
  })
})
