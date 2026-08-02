import { createEditorNote, EditorMode } from '@memorilo/editor'
import { describe, expect, it } from 'vitest'
import { applyExternalNoteUpdate } from './-note-external-update'

function connectedNotes() {
  const source = createEditorNote({ id: 'external-note' })
  const target = createEditorNote({ id: source.id, snapshot: source.exportSnapshot() })
  const topic = source.getEntries().find(entry => entry.kind === 'topic')
  if (!topic)
    throw new Error('Fixture Note is missing its Topic')
  return { source, target, topic }
}

describe('renderer external Note updates', () => {
  it('imports an MCP update, validates Topics, and returns refreshed projections', () => {
    const { source, target, topic } = connectedNotes()
    const version = source.getVersion()
    source.renameEntry(topic.id, 'Renamed externally')
    source.getTopic(topic.id).setMode(EditorMode.Outline)

    const applied = applyExternalNoteUpdate(target, {
      noteId: source.id,
      update: source.exportUpdates(version),
      updatedAt: 123,
    })

    expect(applied).not.toBeNull()
    expect(applied?.updatedAt).toBe(123)
    expect(applied?.entries.find(entry => entry.id === topic.id)).toMatchObject({
      mode: EditorMode.Outline,
      title: 'Renamed externally',
    })
    const restored = createEditorNote({ id: source.id, snapshot: applied?.snapshot })
    expect(restored.getEntries()).toEqual(target.getEntries())
  })

  it('ignores updates for another Note without mutating the open Note', () => {
    const { source, target, topic } = connectedNotes()
    const before = target.getEntries()
    const version = source.getVersion()
    source.renameEntry(topic.id, 'Should not import')

    expect(applyExternalNoteUpdate(target, {
      noteId: 'another-note',
      update: source.exportUpdates(version),
      updatedAt: 123,
    })).toBeNull()
    expect(target.getEntries()).toEqual(before)
  })

  it('rejects malformed external updates', () => {
    const { target } = connectedNotes()
    expect(() => applyExternalNoteUpdate(target, {
      noteId: target.id,
      update: Uint8Array.from([1, 2, 3]),
      updatedAt: 123,
    })).toThrow()
  })

  it('validates on a candidate and leaves the live Note unchanged when merged content is invalid', () => {
    const { source, target, topic } = connectedNotes()
    const sharedVersion = source.getVersion()
    const insertion = {
      blockId: 'offline-duplicate',
      content: [{ type: 'paragraph' as const, content: [{ type: 'text' as const, text: 'Offline' }] }],
      kind: 'outline',
      operation: 'insert-block' as const,
    }
    source.applyTopicBlockEdits({ edits: [{ ...insertion, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Source' }] }] }], topicId: topic.id })
    target.applyTopicBlockEdits({ edits: [{ ...insertion, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Target' }] }] }], topicId: topic.id })
    const before = target.exportSnapshot()

    expect(() => applyExternalNoteUpdate(target, {
      noteId: target.id,
      update: source.exportUpdates(sharedVersion),
      updatedAt: 123,
    })).toThrow()
    expect(target.exportSnapshot()).toEqual(before)
  })
})
