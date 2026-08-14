import type { NodeJSON } from 'prosekit/core'
import { describe, expect, it } from 'vitest'
import { EditorMode } from '../common/editor-mode'
import { createEditorNote } from './editor-note'
import { resolveEditorTopicDocument } from './editor-topic-runtime'

function documentWithText(blockId: string, text: string): NodeJSON {
  return {
    type: 'doc',
    content: [{
      attrs: { blockId, checked: false, collapsed: false, kind: 'outline', order: null },
      content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
      type: 'list',
    }],
  }
}

function whiteboardDocuments(note: ReturnType<typeof createEditorNote>, whiteboardTopicId: string) {
  const validation = note.getTopicValidationInput(whiteboardTopicId) as unknown as {
    embeddedEditors: Readonly<Record<string, { document: NodeJSON, editorId: string, editorMode: number }>>
  }
  return validation.embeddedEditors
}

function firstBlockId(document: NodeJSON): string {
  const blockId = document.content?.[0]?.attrs?.blockId
  if (typeof blockId !== 'string' || blockId.length === 0)
    throw new Error('Fixture document is missing its first BlockID')
  return blockId
}

describe('whiteboardTopic embedded editor CRDT state', () => {
  it('synchronizes multiple independent Embedded Editors without adding Note hierarchy nodes', () => {
    const source = createEditorNote({ id: 'whiteboard-embedded-editors' })
    const [defaultTopic] = source.getEntries()
    if (!defaultTopic)
      throw new Error('Fixture Note is missing its default Topic')
    source.deleteEntry({ entryId: defaultTopic.id, strategy: 'delete-subtree' })

    const folderId = source.createFolder({ name: 'Canvases' })
    const whiteboardTopicId = source.createWhiteboardTopic({ parentId: folderId, title: 'Research board' })
    const childTopicId = source.createTopic({
      initialContent: documentWithText('child-block', 'Visible child Topic'),
      mode: EditorMode.Document,
      parentId: whiteboardTopicId,
      title: 'Child Topic',
    })
    const whiteboard = source.getWhiteboardTopic(whiteboardTopicId)
    const firstEditorId = whiteboard.createEmbeddedEditor({
      initialContent: documentWithText('first-block', 'First editor'),
      mode: EditorMode.Document,
    })
    const secondEditorId = whiteboard.createEmbeddedEditor({
      initialContent: documentWithText('second-block', 'Second editor'),
      mode: EditorMode.Outline,
    })

    const receiver = createEditorNote({ id: source.id, updates: [source.exportUpdates()] })
    const receiverWhiteboard = receiver.getWhiteboardTopic(whiteboardTopicId)

    expect(receiver.getEntries()).toMatchObject([
      { id: folderId, kind: 'folder', parentId: null },
      { id: whiteboardTopicId, kind: 'topic', parentId: folderId, topicType: 'whiteboard' },
      { id: childTopicId, kind: 'topic', parentId: whiteboardTopicId, topicType: 'regular' },
    ])
    expect(receiver.getEntries().map(entry => entry.id)).not.toContain(firstEditorId)
    expect(receiver.getEntries().map(entry => entry.id)).not.toContain(secondEditorId)
    expect(receiverWhiteboard.getEmbeddedEditors()).toEqual([
      { editorId: firstEditorId, mode: EditorMode.Document },
      { editorId: secondEditorId, mode: EditorMode.Outline },
    ].sort((left, right) => left.editorId.localeCompare(right.editorId)))
    expect(whiteboardDocuments(receiver, whiteboardTopicId)).toMatchObject({
      [firstEditorId]: { document: documentWithText('first-block', 'First editor') },
      [secondEditorId]: { document: documentWithText('second-block', 'Second editor') },
    })
    const whiteboardValidation = receiver.getTopicValidationInput(whiteboardTopicId)
    expect(whiteboardValidation).not.toHaveProperty('document')
    expect(whiteboardValidation.entry).not.toHaveProperty('editorMode')
    expect(whiteboardValidation.entry).not.toHaveProperty('blockTreeKey')
    const embeddedRuntime = resolveEditorTopicDocument(receiverWhiteboard.getEmbeddedEditor(firstEditorId))
    expect(embeddedRuntime.documentId).toBe(firstEditorId)
    expect(embeddedRuntime.topicId).toBe(whiteboardTopicId)
    expect(JSON.stringify(embeddedRuntime.tree.toJSON())).toContain('first-block')
  })

  it('converges when peers independently edit different Embedded Editors', () => {
    const source = createEditorNote({ id: 'whiteboard-embedded-convergence' })
    const whiteboardTopicId = source.createWhiteboardTopic({ title: 'Shared board' })
    const whiteboard = source.getWhiteboardTopic(whiteboardTopicId)
    const firstEditorId = whiteboard.createEmbeddedEditor({
      initialContent: documentWithText('left-block', 'Left'),
      mode: EditorMode.Document,
    })
    const secondEditorId = whiteboard.createEmbeddedEditor({
      initialContent: documentWithText('right-block', 'Right'),
      mode: EditorMode.Document,
    })
    const left = createEditorNote({ id: source.id, snapshot: source.exportSnapshot() })
    const right = createEditorNote({ id: source.id, snapshot: source.exportSnapshot() })
    const baseline = left.getVersion()

    left.getWhiteboardTopic(whiteboardTopicId).getEmbeddedEditor(firstEditorId).setMode(EditorMode.Outline)
    right.getWhiteboardTopic(whiteboardTopicId).getEmbeddedEditor(secondEditorId).setMode(EditorMode.Outline)
    const leftUpdate = left.exportUpdates(baseline)
    const rightUpdate = right.exportUpdates(baseline)

    left.importUpdates(rightUpdate)
    right.importUpdates(leftUpdate)

    const expected = [
      { editorId: firstEditorId, mode: EditorMode.Outline },
      { editorId: secondEditorId, mode: EditorMode.Outline },
    ].sort((left, right) => left.editorId.localeCompare(right.editorId))
    expect(left.getWhiteboardTopic(whiteboardTopicId).getEmbeddedEditors()).toEqual(expected)
    expect(right.getWhiteboardTopic(whiteboardTopicId).getEmbeddedEditors()).toEqual(expected)
    expect(left.getTopicValidationInput(whiteboardTopicId))
      .toEqual(right.getTopicValidationInput(whiteboardTopicId))
  })

  it('duplicates Embedded Editor content with fresh persistent identities and synchronizes deletion', () => {
    const source = createEditorNote({ id: 'whiteboard-embedded-copy' })
    const whiteboardTopicId = source.createWhiteboardTopic({ title: 'Copy board' })
    const whiteboard = source.getWhiteboardTopic(whiteboardTopicId)
    const originalEditorId = whiteboard.createEmbeddedEditor({
      initialContent: documentWithText('original-block', 'Reusable content'),
      mode: EditorMode.Outline,
    })
    const duplicateEditorId = whiteboard.duplicateEmbeddedEditor(originalEditorId)
    const documents = whiteboardDocuments(source, whiteboardTopicId)

    expect(duplicateEditorId).not.toBe(originalEditorId)
    expect(documents[duplicateEditorId]?.document.content?.[0]?.content?.[0]?.content?.[0]?.text)
      .toBe(documents[originalEditorId]?.document.content?.[0]?.content?.[0]?.content?.[0]?.text)
    expect(firstBlockId(documents[duplicateEditorId]!.document)).not.toBe(firstBlockId(documents[originalEditorId]!.document))

    const receiver = createEditorNote({ id: source.id, snapshot: source.exportSnapshot() })
    const version = receiver.getVersion()
    source.getWhiteboardTopic(whiteboardTopicId).deleteEmbeddedEditor(duplicateEditorId)
    const mutation = receiver.importUpdates(source.exportUpdates(version))

    expect(mutation.topicIds).toEqual([whiteboardTopicId])
    expect(receiver.getWhiteboardTopic(whiteboardTopicId).getEmbeddedEditors()).toEqual([
      { editorId: originalEditorId, mode: EditorMode.Outline },
    ])
    expect(whiteboardDocuments(receiver, whiteboardTopicId)[duplicateEditorId]).toBeUndefined()
  })
})
