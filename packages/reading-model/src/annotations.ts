export type ReadingAnnotationColor = 'blue' | 'green' | 'pink' | 'purple' | 'yellow'
export type ReadingAnnotationStyle = 'highlight' | 'underline'

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

export type ReadingTextAnchorList = readonly [ReadingTextAnchor, ...ReadingTextAnchor[]]
export type ReadingRegionAnchorList = readonly [ReadingRegionAnchor, ...ReadingRegionAnchor[]]

interface ReadingAnnotationBase {
  annotationTopicId?: string
  color: ReadingAnnotationColor
  createdAt: number
  id: string
  updatedAt: number
}

export interface ReadingTextAnnotation extends ReadingAnnotationBase {
  anchors: ReadingTextAnchorList
  style: ReadingAnnotationStyle
}

export interface ReadingRegionAnnotation extends ReadingAnnotationBase {
  anchors: ReadingRegionAnchorList
  style: 'highlight'
}

export type ReadingAnnotation = ReadingRegionAnnotation | ReadingTextAnnotation

export type ReadingHighlight = ReadingAnnotation
export type ReadingNote = ReadingAnnotation & { annotationTopicId: string }

const annotationColors = new Set<ReadingAnnotationColor>(['blue', 'green', 'pink', 'purple', 'yellow'])
const annotationStyles = new Set<ReadingAnnotationStyle>(['highlight', 'underline'])
const readingFormats = new Set<ReadingAnchor['format']>(['cbr', 'cbz', 'epub', 'pdf', 'txt'])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function assertNonNegativeInteger(value: unknown, label: string): void {
  if (!Number.isSafeInteger(value) || (value as number) < 0)
    throw new RangeError(`${label} must be a non-negative integer`)
}

function assertPositiveInteger(value: unknown, label: string): void {
  if (!Number.isSafeInteger(value) || (value as number) < 1)
    throw new RangeError(`${label} must be a positive integer`)
}

function assertTextQuote(value: unknown): void {
  if (!isRecord(value) || typeof value.exact !== 'string')
    throw new TypeError('Reading text anchor quote must contain exact text')
  if (value.before !== undefined && typeof value.before !== 'string')
    throw new TypeError('Reading text anchor quote before context must be a string')
  if (value.after !== undefined && typeof value.after !== 'string')
    throw new TypeError('Reading text anchor quote after context must be a string')
}

function assertNormalizedRect(value: unknown): void {
  if (!isRecord(value))
    throw new TypeError('Reading anchor rectangle must be an object')
  for (const field of ['height', 'width', 'x', 'y'] as const) {
    const coordinate = value[field]
    if (typeof coordinate !== 'number' || !Number.isFinite(coordinate) || coordinate < 0 || coordinate > 1)
      throw new RangeError(`Reading anchor rectangle ${field} must be between zero and one`)
  }
}

function assertEpubLocator(value: unknown): void {
  if (!isRecord(value)
    || typeof value.href !== 'string'
    || value.href.length === 0
    || typeof value.type !== 'string'
    || value.type.length === 0) {
    throw new TypeError('EPUB reading anchor must contain a serializable locator')
  }
}

function assertReadingAnchor(value: unknown): asserts value is ReadingAnchor {
  if (!isRecord(value) || !readingFormats.has(value.format as ReadingAnchor['format']))
    throw new TypeError('Reading annotation anchor must use a supported format')
  if (value.type !== 'text' && value.type !== 'region')
    throw new TypeError('Reading annotation anchor must be text or region')

  if (value.format === 'pdf') {
    assertPositiveInteger(value.pageNumber, 'PDF reading anchor page number')
    if (value.type === 'region') {
      assertNormalizedRect(value.rect)
      return
    }
    assertTextQuote(value.quote)
    if (value.source !== 'embedded' && value.source !== 'ocr')
      throw new TypeError('PDF text anchor source must be embedded or OCR')
    if (!Array.isArray(value.rects) || value.rects.length === 0)
      throw new TypeError('PDF text anchor must contain at least one rectangle')
    value.rects.forEach(assertNormalizedRect)
    return
  }

  if (value.format === 'epub') {
    assertEpubLocator(value.locator)
    if (value.type === 'text') {
      assertTextQuote(value.quote)
      return
    }
    if (!Array.isArray(value.targets) || value.targets.length === 0)
      throw new TypeError('EPUB region anchor must contain at least one target')
    for (const target of value.targets) {
      if (!isRecord(target) || typeof target.selector !== 'string' || target.selector.length === 0)
        throw new TypeError('EPUB region anchor target must contain a selector')
      assertNormalizedRect(target.rect)
    }
    return
  }

  if (value.format === 'txt') {
    assertNonNegativeInteger(value.start, 'TXT reading anchor start')
    assertNonNegativeInteger(value.end, 'TXT reading anchor end')
    if ((value.end as number) <= (value.start as number))
      throw new RangeError('TXT reading anchor end must follow its start')
    if (value.type === 'text')
      assertTextQuote(value.quote)
    return
  }

  if (value.type !== 'region')
    throw new TypeError('Comic reading annotations must be regions')
  assertPositiveInteger(value.pageNumber, 'Comic reading anchor page number')
  assertNormalizedRect(value.rect)
}

/** Validates an annotation restored from persistent or external data. */
export function assertReadingAnnotation(value: unknown): asserts value is ReadingAnnotation {
  if (!isRecord(value))
    throw new TypeError('Reading annotation must be an object')
  if (typeof value.id !== 'string' || value.id.length === 0)
    throw new TypeError('Reading annotation id must be a non-empty string')
  if (value.annotationTopicId !== undefined
    && (typeof value.annotationTopicId !== 'string' || value.annotationTopicId.length === 0)) {
    throw new TypeError('Reading annotation Topic id must be a non-empty string')
  }
  if (!annotationColors.has(value.color as ReadingAnnotationColor))
    throw new TypeError('Reading annotation color is invalid')
  if (!annotationStyles.has(value.style as ReadingAnnotationStyle))
    throw new TypeError('Reading annotation style is invalid')
  assertNonNegativeInteger(value.createdAt, 'Reading annotation creation time')
  assertNonNegativeInteger(value.updatedAt, 'Reading annotation update time')
  if (!Array.isArray(value.anchors) || value.anchors.length === 0)
    throw new TypeError('Reading annotation must contain at least one anchor fragment')
  value.anchors.forEach(assertReadingAnchor)
  const first = value.anchors[0]
  if (!first)
    throw new TypeError('Reading annotation must contain at least one anchor fragment')
  if (value.anchors.some(anchor => anchor.format !== first.format || anchor.type !== first.type))
    throw new TypeError('Reading annotation fragments must use the same format and type')
  if (first.type === 'region' && value.style !== 'highlight')
    throw new TypeError('Reading region annotations only support highlight style')
}

export function readingAnnotationText(annotation: ReadingAnnotation): string | null {
  const first = annotation.anchors[0]
  if (first.type !== 'text')
    return null
  return annotation.anchors
    .map((anchor) => {
      if (anchor.type !== 'text')
        throw new TypeError(`Reading annotation ${annotation.id} contains mixed anchor types`)
      return anchor.quote.exact
    })
    .join('\n')
}

export function readingAnnotationFirstAnchor(annotation: ReadingAnnotation): ReadingAnchor {
  return annotation.anchors[0]
}

export function isReadingTextAnnotation(annotation: ReadingAnnotation): annotation is ReadingTextAnnotation {
  return annotation.anchors[0].type === 'text'
}

export function isReadingRegionAnnotation(annotation: ReadingAnnotation): annotation is ReadingRegionAnnotation {
  return annotation.anchors[0].type === 'region'
}
