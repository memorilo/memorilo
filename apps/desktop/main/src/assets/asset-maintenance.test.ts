import type { EditorStorage, NoteSummary, StoredNote } from '@memorilo/editor-storage'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { checkManagedAssets } from './asset-maintenance'

vi.mock('@memorilo/editor/note', () => ({
  createEditorNote: ({ id }: { id: string }) => ({
    getEntries: () => [],
    id,
  }),
}))

const temporaryDirectories: string[] = []

function note(id: string): NoteSummary {
  return {
    createdAt: 1,
    favorite: false,
    id,
    title: id,
    updatedAt: 1,
  }
}

function storedNote(id: string): StoredNote {
  return {
    checkpointSequence: 0,
    createdAt: 1,
    id,
    latestSequence: 0,
    snapshot: null,
    title: id,
    updatedAt: 1,
    updates: [],
  }
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(directory => rm(directory, { force: true, recursive: true })))
})

describe('asset maintenance', () => {
  it('reconciles a stable snapshot of every note when list ordering changes during a scan', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'memorilo-assets-'))
    temporaryDirectories.push(directory)
    const initial = Array.from({ length: 201 }, (_, index) => note(`note-${String(index + 1).padStart(3, '0')}`))
    let ordered = initial
    const reconciled = new Set<string>()
    let listCalls = 0
    const storage = {
      assets: {
        list: async () => [],
        listClaimed: async () => [],
        listUnreferenced: async () => [],
      },
      notes: {
        getNote: async ({ noteId }: { noteId: string }) => storedNote(noteId),
        listNoteIds: async () => initial.map(item => item.id),
        listNotes: async ({ page, pageSize }: { page: number, pageSize: number }) => {
          listCalls += 1
          const offset = (page - 1) * pageSize
          const items = ordered.slice(offset, offset + pageSize)
          if (listCalls === 1) {
            const changed = [...ordered]
            const moved = changed.splice(100, 1)[0]
            if (!moved)
              throw new Error('Expected a note at the page boundary')
            changed.unshift(moved)
            ordered = changed
          }
          return {
            items,
            page,
            pageSize,
            totalItems: ordered.length,
            totalPages: Math.ceil(ordered.length / pageSize),
          }
        },
        reconcileNoteAssetReferences: async ({ noteId }: { noteId: string }) => {
          reconciled.add(noteId)
          return true
        },
      },
    } as unknown as EditorStorage

    await checkManagedAssets(storage, directory, 0)

    expect(reconciled).toEqual(new Set(initial.map(item => item.id)))
  })
})
