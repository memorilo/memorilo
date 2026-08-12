import type { ShelfBrowseResult, ShelfPublication, ShelfSource } from '@memorilo/shelf'
import { describe, expect, it } from 'vitest'
import {
  formatShelfPublicationAuthors,
  latestShelfBrowseIssue,
  matchingShelfPublications,
  nextShelfCatalogUrl,
  shelfBrowseIssueTranslation,
  uniqueShelfPublications,
} from './shelf-publication-collection'

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

function publication(id: string, title: string, authors: readonly string[] = []): ShelfPublication {
  return { authors, coverUrl: null, id, links: [], section: null, subtitle: null, summary: null, title }
}

function result({
  issue = null,
  navigation = [],
  nextUrl = null,
  publications = [],
  selfUrl = 'https://example.test/opds',
}: {
  issue?: { kind: 'network' } | null
  navigation?: Array<{ href: string, subtitle: null, title: string }>
  nextUrl?: string | null
  publications?: readonly ShelfPublication[]
  selfUrl?: string
}): ShelfBrowseResult {
  return {
    groups: [{
      issue,
      page: { navigation, nextUrl, publications, selfUrl, subtitle: null, title: 'Books' },
      source,
    }],
    refreshedAt: null,
  }
}

describe('shelf publication collection', () => {
  it('formats authors and matches normalized title or author text', () => {
    const unknown = publication('unknown', 'Untitled')
    const dune = publication('dune', 'Dune', ['Frank Herbert'])

    expect(formatShelfPublicationAuthors(unknown)).toBe('Unknown author')
    expect(formatShelfPublicationAuthors(unknown, '未知作者')).toBe('未知作者')
    expect(formatShelfPublicationAuthors(dune)).toBe('Frank Herbert')
    expect(matchingShelfPublications([unknown, dune], '  DUNE ')).toEqual([dune])
    expect(matchingShelfPublications([unknown, dune], 'herbert')).toEqual([dune])
  })

  it('descends through an empty catalog before following its pagination link', () => {
    const navigationUrl = 'https://example.test/category'
    const nextUrl = 'https://example.test/page-2'
    const catalog = result({
      navigation: [{ href: navigationUrl, subtitle: null, title: 'Category' }],
      nextUrl,
    })

    expect(nextShelfCatalogUrl([catalog], [], source.id, true)).toBe(navigationUrl)
    expect(nextShelfCatalogUrl([catalog], [navigationUrl], source.id, true)).toBe(nextUrl)
    expect(nextShelfCatalogUrl([catalog], [], source.id, false)).toBe(nextUrl)
  })

  it('deduplicates later pages and reports the latest issue', () => {
    const original = publication('book-1', 'Original')
    const updated = publication('book-1', 'Updated')
    const first = result({ issue: { kind: 'network' }, publications: [original] })
    const second = result({ issue: { kind: 'network' }, publications: [updated] })

    expect(uniqueShelfPublications([first, second], source.id)).toEqual([updated])
    expect(latestShelfBrowseIssue([first, second], source.id)).toEqual({ kind: 'network' })
  })

  it('maps structured browse issues to renderer-owned translations', () => {
    expect(shelfBrowseIssueTranslation({ kind: 'authentication' })).toEqual({
      key: 'shelfSourceAuthenticationRequired',
    })
    expect(shelfBrowseIssueTranslation({ kind: 'network' })).toEqual({ key: 'shelfSourceUnavailable' })
    expect(shelfBrowseIssueTranslation({ kind: 'parse' })).toEqual({ key: 'shelfSourceInvalidCatalog' })
    expect(shelfBrowseIssueTranslation({ kind: 'response', status: 503 })).toEqual({
      key: 'shelfSourceRequestFailed',
      options: { status: 503 },
    })
  })
})
