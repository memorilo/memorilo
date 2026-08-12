import type { ShelfBrowseGroup, ShelfPublication, ShelfSource } from '@memorilo/shelf'
import { describe, expect, it } from 'vitest'
import {
  createShelfVirtualRows,
  shelfPublicationColumnCount,
  shelfPublicationGridTemplate,
} from './shelf-publication-layout'

const source: ShelfSource = {
  addedAt: 1,
  auth: 'none',
  enabled: true,
  id: 'source-1',
  kind: 'opds',
  name: 'Library',
  orderKey: 'a',
  updatedAt: 1,
  url: 'https://example.test/opds',
  username: null,
}

function publication(id: string, title: string): ShelfPublication {
  return { authors: [], coverUrl: null, id, links: [], section: null, subtitle: null, summary: null, title }
}

function group(publications: readonly ShelfPublication[]): ShelfBrowseGroup {
  return {
    issue: null,
    page: {
      navigation: [],
      nextUrl: null,
      publications,
      selfUrl: source.url,
      subtitle: null,
      title: source.name,
    },
    source,
  }
}

describe('shelf publication layout', () => {
  it('clamps responsive columns and produces a stable grid template', () => {
    expect(shelfPublicationColumnCount(0)).toBe(2)
    expect(shelfPublicationColumnCount(600)).toBe(3)
    expect(shelfPublicationColumnCount(4_000)).toBe(9)
    expect(shelfPublicationGridTemplate(3)).toBe('repeat(3, minmax(0, 140px))')
    expect(() => shelfPublicationGridTemplate(10)).toThrow('between 1 and 9')
  })

  it('filters, chunks, and keys virtual rows without losing group ownership', () => {
    const catalog = group([
      publication('one', 'Matching One'),
      publication('two', 'Hidden'),
      publication('three', 'Matching Three'),
    ])
    const rows = createShelfVirtualRows([catalog], 1, 'matching', true)

    expect(rows.map(row => row.id)).toEqual([
      'heading:source-1',
      'books:source-1:0',
      'books:source-1:1',
    ])
    expect(rows[0]).toMatchObject({ kind: 'heading', publicationCount: 2 })
    expect(rows.slice(1).map(row => row.kind === 'publications' ? row.publications[0]?.id : null)).toEqual(['one', 'three'])
  })
})
