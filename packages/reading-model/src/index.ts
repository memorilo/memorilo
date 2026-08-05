import type { ReadingFormat } from '@memorilo/reading-format'

export type ReadingAnnotationColor = 'blue' | 'green' | 'pink' | 'purple' | 'yellow'

export interface BookMetadataSnapshot {
  authors: readonly string[]
  title: string
}

export interface BookFileDescriptor {
  byteLength: number
  format: ReadingFormat
  originalName: string
  sha256: string
}

export interface ShelfRenditionLocator {
  kind: 'shelf'
  publicationId: string
  readingId: string
  sourceId: string
}

export interface LocalReadingLocator {
  kind: 'local'
  readingId: string
}

export type BookFileLocator = LocalReadingLocator | ShelfRenditionLocator

export interface BookFileBinding {
  book: BookMetadataSnapshot
  file: BookFileDescriptor
  retrievalHints: readonly BookFileLocator[]
}

/** A rectangle normalized to its rendered anchor surface, with every value between 0 and 1. */
export interface ReadingNormalizedRect {
  height: number
  width: number
  x: number
  y: number
}

export interface ReadingTextQuote {
  after?: string
  before?: string
  exact: string
}

/** A serializable Readium locator. It intentionally contains no Readium class instances. */
export interface ReadingEpubLocator {
  href: string
  locations?: Record<string, unknown>
  text?: Record<string, unknown>
  title?: string
  type: string
}

export interface ReadingPdfTextAnchor {
  format: 'pdf'
  pageNumber: number
  quote: ReadingTextQuote
  rects: readonly ReadingNormalizedRect[]
  source: 'embedded' | 'ocr'
  type: 'text'
}

export interface ReadingPdfRegionAnchor {
  format: 'pdf'
  pageNumber: number
  rect: ReadingNormalizedRect
  type: 'region'
}

export interface ReadingEpubTextAnchor {
  format: 'epub'
  locator: ReadingEpubLocator
  quote: ReadingTextQuote
  type: 'text'
}

export interface ReadingEpubRegionTarget {
  rect: ReadingNormalizedRect
  selector: string
}

export interface ReadingEpubRegionAnchor {
  format: 'epub'
  locator: ReadingEpubLocator
  targets: readonly ReadingEpubRegionTarget[]
  type: 'region'
}

export interface ReadingTxtTextAnchor {
  end: number
  format: 'txt'
  quote: ReadingTextQuote
  start: number
  type: 'text'
}

export interface ReadingTxtRegionAnchor {
  end: number
  format: 'txt'
  start: number
  type: 'region'
}

export interface ReadingComicRegionAnchor {
  format: 'cbr' | 'cbz'
  pageNumber: number
  rect: ReadingNormalizedRect
  type: 'region'
}

export type ReadingTextAnchor = ReadingEpubTextAnchor | ReadingPdfTextAnchor | ReadingTxtTextAnchor
export type ReadingRegionAnchor
  = | ReadingComicRegionAnchor
    | ReadingEpubRegionAnchor
    | ReadingPdfRegionAnchor
    | ReadingTxtRegionAnchor
export type ReadingAnchor = ReadingRegionAnchor | ReadingTextAnchor

interface ReadingAnnotationBase {
  anchor: ReadingAnchor
  color: ReadingAnnotationColor
  createdAt: number
  id: string
  updatedAt: number
}

export interface ReadingHighlight extends ReadingAnnotationBase {
  kind: 'highlight'
}

export interface ReadingNote extends ReadingAnnotationBase {
  body: string
  kind: 'annotation'
}

export type ReadingAnnotation = ReadingHighlight | ReadingNote

export interface ReadingEpubPosition {
  format: 'epub'
  locator: ReadingEpubLocator
}

export interface ReadingPdfPosition {
  format: 'pdf'
  pageNumber: number
}

export interface ReadingComicPosition {
  format: 'cbr' | 'cbz'
  pageNumber: number
}

export interface ReadingTxtPosition {
  format: 'txt'
  offset: number
}

export type ReadingPosition = ReadingComicPosition | ReadingEpubPosition | ReadingPdfPosition | ReadingTxtPosition

export interface BookReadingState {
  annotations: readonly ReadingAnnotation[]
  position: ReadingPosition | null
}

const sha256Pattern = /^[a-f0-9]{64}$/u

export function bookFileIdentityKey(file: Pick<BookFileDescriptor, 'format' | 'sha256'>): string {
  assertBookFileSha256(file.sha256)
  return `${file.format}:${file.sha256}`
}

export function assertBookFileSha256(value: string): void {
  if (!sha256Pattern.test(value))
    throw new TypeError('Book file SHA-256 must be a lowercase hexadecimal digest')
}

export function sameBookFile(
  left: Pick<BookFileDescriptor, 'format' | 'sha256'>,
  right: Pick<BookFileDescriptor, 'format' | 'sha256'>,
): boolean {
  return left.format === right.format && left.sha256 === right.sha256
}
