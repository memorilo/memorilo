import { describe, expect, it } from 'vitest'

import { parseShelfPage } from './opds-parser'

describe('parseShelfPage', () => {
  it('normalizes OPDS2 groups and drops non-http links', () => {
    const page = parseShelfPage(JSON.stringify({
      metadata: { title: 'Library', description: 'A source' },
      links: [
        { href: '/opds', rel: 'self' },
        { href: 'javascript:alert(1)', rel: 'next' },
      ],
      groups: [{
        metadata: { title: 'Fiction' },
        publications: [{
          metadata: {
            author: [{ name: 'Author' }],
            belongsTo: { series: [{ name: 'Series', position: 2 }] },
            description: 'Description\n\nTAGS: hidden',
            identifier: 'book-1',
            title: 'Book',
          },
          images: [{ href: '/thumb.jpg', rel: 'thumbnail' }],
          links: [{ href: '/book.epub', rel: 'http://opds-spec.org/acquisition' }],
        }],
      }],
    }), 'application/opds+json', 'https://books.example/catalog')

    expect(page.title).toBe('Library')
    expect(page.selfUrl).toBe('https://books.example/opds')
    expect(page.nextUrl).toBeNull()
    expect(page.publications[0]).toMatchObject({
      authors: ['Author'],
      coverUrl: 'https://books.example/thumb.jpg',
      id: 'book-1',
      section: 'Fiction',
      summary: 'Description',
    })
    const publication = page.publications[0]
    if (!publication)
      throw new TypeError('Expected a publication')
    if (!publication.metadata)
      throw new TypeError('Expected publication metadata')
    expect(publication.metadata.collections).toEqual([{ name: 'Series', position: 2, type: 'series' }])
  })

  it('parses Atom entries into navigation and acquisition publications', () => {
    const page = parseShelfPage(`<?xml version="1.0"?>
      <feed xmlns="http://www.w3.org/2005/Atom">
        <title>Library</title>
        <link rel="next" href="/page-2" />
        <entry><title>More</title><link href="/more" /></entry>
        <entry><id>urn:book:1</id><title>Book</title>
          <author><name>Writer</name></author>
          <link rel="http://opds-spec.org/acquisition" href="/book.epub" />
        </entry>
      </feed>`, 'application/atom+xml', 'https://books.example/catalog')

    expect(page.nextUrl).toBe('https://books.example/page-2')
    expect(page.navigation).toEqual([{ href: 'https://books.example/more', subtitle: null, title: 'More' }])
    expect(page.publications[0]).toMatchObject({ authors: ['Writer'], id: 'urn:book:1', title: 'Book' })
  })

  it('rejects feeds without a title', () => {
    expect(() => parseShelfPage(JSON.stringify({ metadata: {} }), 'application/json', 'https://books.example/catalog'))
      .toThrow('OPDS feed is missing a title')
  })
})
