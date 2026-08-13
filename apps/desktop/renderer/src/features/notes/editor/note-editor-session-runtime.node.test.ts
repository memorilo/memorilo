import type { DesktopRegularNote } from '@memorilo/desktop-preload'
import type { EditorNoteChange } from '@memorilo/editor/note'
import type { EditorNoteSessionCache } from '../note-runtime'
import { createEditorNote } from '@memorilo/editor/note'
import { describe, expect, it, vi } from 'vitest'
import { EditorNoteSessionRuntime } from './note-editor-session-runtime'

function storedNote(id: string): { stored: DesktopRegularNote, topicId: string } {
  const note = createEditorNote({ id, title: id })
  const topic = note.getEntries().find(entry => entry.kind === 'topic')
  if (!topic)
    throw new Error(`Test Note ${id} does not contain a Topic`)
  return {
    stored: {
      createdAt: 1,
      favorite: false,
      id,
      kind: 'regular',
      snapshot: note.exportSnapshot(),
      title: id,
      updatedAt: 1,
    },
    topicId: topic.id,
  }
}

function persistence() {
  const pending: EditorNoteChange[] = []
  return {
    enqueue: vi.fn((change: EditorNoteChange) => pending.push(change)),
    getPendingChanges: vi.fn(() => [...pending]),
    replacePending: vi.fn((update: Uint8Array) => {
      pending.splice(0, pending.length, { noteId: 'runtime-note', update })
    }),
  }
}

describe('editor Note session runtime', () => {
  it('isolates observer failures from an already accepted local change', () => {
    const fixture = storedNote('observer-note')
    const queue = persistence()
    const failure = new Error('view already unmounted')
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const runtime = new EditorNoteSessionRuntime({
      noteId: fixture.stored.id,
      onEvent: () => { throw failure },
      persistence: queue,
      preferredTopicId: fixture.topicId,
      resolveTopic: note => note.getTopic(fixture.topicId),
    })
    const opened = runtime.open(fixture.stored)

    try {
      expect(() => opened.note.createFolder({ name: 'Research' })).not.toThrow()
      expect(queue.enqueue).toHaveBeenCalled()
      expect(consoleError).toHaveBeenCalledWith(
        `Editor Note session observer failed for Note ${fixture.stored.id}`,
        failure,
      )
    }
    finally {
      consoleError.mockRestore()
      runtime.close()
    }
  })

  it('publishes local entry projections and stops persistence admission after close', () => {
    const fixture = storedNote('runtime-note')
    const events: unknown[] = []
    const queue = persistence()
    const runtime = new EditorNoteSessionRuntime({
      noteId: fixture.stored.id,
      onEvent: event => events.push(event),
      persistence: queue,
      preferredTopicId: fixture.topicId,
      resolveTopic: note => note.getTopic(fixture.topicId),
    })
    const opened = runtime.open(fixture.stored)

    const folderId = opened.note.createFolder({ name: 'Research' })

    expect(queue.enqueue).toHaveBeenCalled()
    expect(events).toContainEqual(
      expect.objectContaining({
        opened: expect.objectContaining({
          entries: expect.arrayContaining([
            expect.objectContaining({ id: folderId, kind: 'folder', name: 'Research' }),
          ]),
        }),
        source: 'local',
        type: 'opened',
      }),
    )

    const acceptedChanges = queue.enqueue.mock.calls.length
    runtime.close()
    opened.note.createFolder({ name: 'Detached' })
    expect(queue.enqueue).toHaveBeenCalledTimes(acceptedChanges)
  })

  it('preflights cached merges without poisoning the retained Undo session', () => {
    const fixture = storedNote('cached-note')
    const cached = createEditorNote({ id: fixture.stored.id, snapshot: fixture.stored.snapshot })
    const persisted = createEditorNote({ id: fixture.stored.id, snapshot: fixture.stored.snapshot })
    const sharedVersion = cached.getVersion()
    const duplicate = {
      blockId: 'offline-duplicate',
      content: [{ type: 'paragraph' as const, content: [{ type: 'text' as const, text: 'Cached' }] }],
      kind: 'outline',
      operation: 'insert-block' as const,
    }
    cached.applyTopicBlockEdits({ edits: [duplicate], topicId: fixture.topicId })
    persisted.applyTopicBlockEdits({
      edits: [{ ...duplicate, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Persisted' }] }] }],
      topicId: fixture.topicId,
    })
    const before = cached.exportSnapshot()
    const cache: EditorNoteSessionCache = {
      clear: vi.fn(),
      delete: vi.fn(),
      get: () => cached,
      set: vi.fn(),
    }
    const runtime = new EditorNoteSessionRuntime({
      cache,
      noteId: fixture.stored.id,
      onEvent: vi.fn(),
      persistence: {
        enqueue: vi.fn(),
        getPendingChanges: () => [{
          noteId: fixture.stored.id,
          update: persisted.exportUpdates(sharedVersion),
        }],
        replacePending: vi.fn(),
      },
      preferredTopicId: fixture.topicId,
      resolveTopic: note => note.getTopic(fixture.topicId),
    })

    expect(() => runtime.open(fixture.stored)).toThrow()
    expect(cached.exportSnapshot()).toEqual(before)
    expect(cache.set).not.toHaveBeenCalled()
  })

  it('atomically replaces pending changes when the active Topic is invalidated', () => {
    const fixture = storedNote('runtime-note')
    const events: unknown[] = []
    const queue = persistence()
    const runtime = new EditorNoteSessionRuntime({
      noteId: fixture.stored.id,
      onEvent: event => events.push(event),
      persistence: queue,
      preferredTopicId: fixture.topicId,
      resolveTopic: note => note.getTopic(fixture.topicId),
    })
    const opened = runtime.open(fixture.stored)

    opened.note.deleteEntry({ entryId: fixture.topicId, strategy: 'delete-subtree' })

    expect(queue.enqueue).not.toHaveBeenCalled()
    expect(queue.replacePending).toHaveBeenCalledOnce()
    expect(events).toEqual([
      expect.objectContaining({
        diagnostics: expect.stringContaining(`Topic ID: ${fixture.topicId}`),
        opened: expect.objectContaining({
          entries: [expect.objectContaining({ id: fixture.topicId, kind: 'topic' })],
        }),
        source: 'restored',
        type: 'opened',
      }),
    ])
  })
})
