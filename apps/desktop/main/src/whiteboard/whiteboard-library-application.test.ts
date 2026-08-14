import type { EditorUserDocumentStorage } from '@memorilo/editor-storage'
import { createWhiteboardLibraryDocument } from '@memorilo/editor/note'
import { describe, expect, it } from 'vitest'
import { WhiteboardLibraryApplication } from './whiteboard-library-application'

const libraryItem = {
  created: 123,
  elements: [{
    height: 60,
    id: 'rectangle-1',
    isDeleted: false,
    link: null,
    type: 'rectangle',
    width: 80,
    x: 10,
    y: 20,
  }],
  id: 'library-item-1',
  status: 'unpublished' as const,
}

function memoryStorage() {
  let snapshot: Uint8Array | null = null
  let failNextSave = false
  const storage: EditorUserDocumentStorage = {
    load: async () => snapshot === null ? null : new Uint8Array(snapshot),
    save: async (input) => {
      if (failNextSave) {
        failNextSave = false
        throw new Error('Injected user document write failure')
      }
      snapshot = new Uint8Array(input.snapshot)
    },
  }
  return {
    failSave: () => {
      failNextSave = true
    },
    snapshot: () => snapshot === null ? null : new Uint8Array(snapshot),
    storage,
  }
}

describe('whiteboard library application', () => {
  it('initializes one durable LoroDoc and restores it in a new application instance', async () => {
    const persistence = memoryStorage()
    const first = await WhiteboardLibraryApplication.open(persistence.storage)

    await expect(first.load()).resolves.toEqual({ libraryItems: [] })
    const initializedSnapshot = persistence.snapshot()
    if (initializedSnapshot === null)
      throw new Error('Whiteboard Library initialization was not persisted')
    expect(createWhiteboardLibraryDocument({ snapshot: initializedSnapshot }).getItems()).toEqual([])

    await first.save({ libraryItems: [libraryItem] })
    await expect(first.load()).resolves.toEqual({ libraryItems: [libraryItem] })
    await first.close()

    const second = await WhiteboardLibraryApplication.open(persistence.storage)
    await expect(second.load()).resolves.toEqual({ libraryItems: [libraryItem] })
    await second.close()
  })

  it('does not publish a failed database write to later reads', async () => {
    const persistence = memoryStorage()
    const application = await WhiteboardLibraryApplication.open(persistence.storage)
    persistence.failSave()

    await expect(application.save({ libraryItems: [libraryItem] })).rejects.toThrow(
      'Injected user document write failure',
    )
    await expect(application.load()).resolves.toEqual({ libraryItems: [] })
    const storedSnapshot = persistence.snapshot()
    if (storedSnapshot === null)
      throw new Error('Whiteboard Library initialization snapshot is missing')
    expect(createWhiteboardLibraryDocument({ snapshot: storedSnapshot }).getItems()).toEqual([])
    await application.close()
  })
})
