import type { DesktopNotePage, DesktopNoteSummary } from '@memorilo/desktop-preload'
import type { InfiniteData } from 'effect-query'
import { describe, expect, it } from 'vitest'
import {
  resolveNoteLibrarySort,
  updateFavoriteNoteCache,
  updateRenamedNoteCache,
} from './note-library-model'

function note(id: string, favorite = false): DesktopNoteSummary {
  return {
    createdAt: 1,
    favorite,
    id,
    kind: 'regular',
    title: `Note ${id}`,
    updatedAt: 2,
  }
}

function cache(...items: readonly DesktopNoteSummary[]): InfiniteData<DesktopNotePage> {
  return {
    pageParams: [1],
    pages: [{
      items,
      page: 1,
      pageSize: 100,
      totalItems: items.length,
      totalPages: 1,
    }],
  }
}

describe('note library model', () => {
  it.each([
    ['createdAt', false, { sortBy: 'createdAt', sortDirection: 'asc' }],
    ['title', true, { sortBy: 'title', sortDirection: 'desc' }],
    ['updatedAt', false, { sortBy: 'updatedAt', sortDirection: 'asc' }],
  ] as const)('resolves the %s table sort', (id, desc, expected) => {
    expect(resolveNoteLibrarySort([{ desc, id }])).toEqual(expected)
  })

  it('rejects missing and unknown table sorts', () => {
    expect(() => resolveNoteLibrarySort([])).toThrow('must always have one active sort column')
    expect(() => resolveNoteLibrarySort([{ desc: false, id: 'favorite' }]))
      .toThrow('Unknown Note library sort column: favorite')
  })

  it('replaces only the page containing a renamed note', () => {
    const first = note('first')
    const second = note('second')
    const data = cache(first, second)
    const renamed = { ...second, title: 'Renamed' }

    const updated = updateRenamedNoteCache(data, renamed)

    expect(updated).not.toBe(data)
    expect(updated?.pages[0]).not.toBe(data.pages[0])
    expect(updated?.pages[0]?.items).toEqual([first, renamed])
    expect(updateRenamedNoteCache(data, note('missing'))).toBe(data)
  })

  it('updates favorite state without mutating the cached note', () => {
    const original = note('note')
    const data = cache(original)

    const updated = updateFavoriteNoteCache(data, { favorite: true, noteId: original.id })

    expect(updated).not.toBe(data)
    expect(updated?.pages[0]?.items[0]).toEqual({ ...original, favorite: true })
    expect(original.favorite).toBe(false)
    expect(updateFavoriteNoteCache(data, { favorite: true, noteId: 'missing' })).toBe(data)
  })

  it('preserves an absent cache', () => {
    expect(updateRenamedNoteCache(undefined, note('note'))).toBeUndefined()
    expect(updateFavoriteNoteCache(undefined, { favorite: true, noteId: 'note' })).toBeUndefined()
  })
})
