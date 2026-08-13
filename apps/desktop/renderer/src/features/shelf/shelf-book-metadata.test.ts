import type { ShelfPublication } from '@memorilo/shelf'
import { describe, expect, it } from 'vitest'
import { projectShelfBookMetadata } from './shelf-book-metadata'

function publication(): ShelfPublication {
  return {
    authors: ['Author'],
    coverUrl: null,
    id: 'book-1',
    links: [
      { href: 'book.epub', rel: 'http://opds-spec.org/acquisition', type: 'application/epub+zip' },
      { href: 'duplicate.epub', rel: 'acquisition', type: 'application/epub+zip' },
      { href: 'cover.jpg', rel: 'cover', type: 'image/jpeg' },
    ],
    metadata: {
      accessibilityFeatures: ['tableOfContents'],
      accessibilityHazards: ['none'],
      accessibilityModes: ['textual'],
      accessibilitySummary: 'Screen reader ready',
      collections: [
        { name: 'Series', position: 2, type: 'series' },
        { name: 'Library', position: null, type: 'collection' },
      ],
      conformsTo: ['EPUB 3'],
      contributors: [
        { name: 'First Artist', role: 'penciler' },
        { name: 'Second Artist', role: 'penciler' },
      ],
      duration: 3_900,
      identifiers: [],
      imprints: ['Imprint'],
      languages: ['en'],
      modified: '2026-08-11T10:00:00Z',
      numberOfPages: 320,
      published: '2024-02-29',
      publishers: ['Publisher', 'Publisher'],
      readingProgression: 'rtl',
      rights: 'All rights reserved',
      subjects: [{ code: 'FIC', name: 'Fiction', scheme: 'BISAC' }],
      types: ['http://schema.org/Book'],
    },
    section: null,
    subtitle: null,
    summary: '<p>First paragraph.</p><p>Second <strong>paragraph</strong>.</p>',
    title: 'Book',
  }
}

describe('shelf book metadata projection', () => {
  it('projects publication metadata into display rows', () => {
    const projection = projectShelfBookMetadata(publication(), 'Public Library')

    expect(projection.formats).toEqual(['EPUB'])
    expect(projection.headlineFacts).toEqual(['EPUB', 'English', 'Public Library'])
    expect(projection.summary).toBe('First paragraph.\n\nSecond paragraph.')
    expect(projection.information).toEqual(expect.arrayContaining([
      { label: 'Publisher', value: 'Publisher' },
      { label: 'Published', value: 'Feb 29, 2024' },
      { label: 'Series', value: 'Series · 2' },
      { label: 'Pencilers', value: 'First Artist, Second Artist' },
      { label: 'Duration', value: '1 hr 5 min' },
    ]))
    expect(projection.technical).toEqual(expect.arrayContaining([
      { label: 'Subject Codes', value: 'Fiction: FIC (BISAC)' },
      { label: 'Reading', value: 'Right to left' },
      { label: 'Identifier', value: 'book-1' },
      { label: 'Format', value: 'EPUB' },
      { label: 'Book Source', value: 'Public Library' },
    ]))
  })

  it('retains the source and publication identifier when optional metadata is absent', () => {
    const minimal = { ...publication(), links: [], metadata: undefined, summary: '   ' }

    expect(projectShelfBookMetadata(minimal, 'Archive')).toEqual({
      formats: [],
      headlineFacts: ['Archive'],
      information: [],
      summary: null,
      technical: [
        { label: 'Identifier', value: 'book-1' },
        { label: 'Book Source', value: 'Archive' },
      ],
    })
  })
})
