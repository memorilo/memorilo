import { describe, expect, it } from 'vitest'
import { createEditorNote } from './editor-note'

describe('whiteboard scene persistence', () => {
  it('does not emit a CRDT update when only object key order changes', () => {
    const note = createEditorNote({ id: 'whiteboard-scene-key-order' })
    const whiteboardTopicId = note.createWhiteboardTopic({ title: 'Stable scene' })
    const whiteboard = note.getWhiteboardTopic(whiteboardTopicId)
    whiteboard.setScene({
      appState: { scrollX: 4, scrollY: 8 },
      elements: [{ customData: { alpha: 1, beta: 2 }, id: 'element' }],
      files: {},
    })
    const updates: Uint8Array[] = []
    const unsubscribe = note.subscribe(change => updates.push(change.update))

    whiteboard.setScene({
      files: {},
      elements: [{ id: 'element', customData: { beta: 2, alpha: 1 } }],
      appState: { scrollY: 8, scrollX: 4 },
    })

    unsubscribe()
    expect(updates).toHaveLength(0)
  })
})
