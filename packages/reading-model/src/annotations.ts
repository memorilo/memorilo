export type ReadingAnnotationColor = 'blue' | 'green' | 'pink' | 'purple' | 'yellow'

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
