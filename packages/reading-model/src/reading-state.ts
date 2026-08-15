import type { ReadingAnnotation, ReadingEpubLocator } from './annotations'

export interface ReadingEpubPosition {
  format: 'epub'
  locator: ReadingEpubLocator
}

export interface ReadingPdfPosition {
  format: 'pdf'
  pageNumber: number
  pageProgress: number
}

export interface ReadingComicPosition {
  format: 'cbr' | 'cbz'
  pageNumber: number
  pageProgress: number
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function assertFixedPagePosition(value: Record<string, unknown>, label: string): void {
  if (!Number.isSafeInteger(value.pageNumber) || (value.pageNumber as number) < 1)
    throw new RangeError(`${label} page number must be a positive integer`)
  if (typeof value.pageProgress !== 'number'
    || !Number.isFinite(value.pageProgress)
    || value.pageProgress < 0
    || value.pageProgress > 1) {
    throw new RangeError(`${label} page progress must be between zero and one`)
  }
}

/** Validates a reading position restored from persistent or external data. */
export function assertReadingPosition(value: unknown): asserts value is ReadingPosition {
  if (!isRecord(value))
    throw new TypeError('Reading position must be an object')
  switch (value.format) {
    case 'cbr':
    case 'cbz':
    case 'pdf':
      assertFixedPagePosition(value, String(value.format).toUpperCase())
      return
    case 'epub':
      if (!isRecord(value.locator)
        || typeof value.locator.href !== 'string'
        || value.locator.href.length === 0
        || typeof value.locator.type !== 'string'
        || value.locator.type.length === 0) {
        throw new TypeError('EPUB reading position must contain a serializable locator')
      }
      return
    case 'txt':
      if (!Number.isSafeInteger(value.offset) || (value.offset as number) < 0)
        throw new RangeError('TXT reading position offset must be a non-negative integer')
      return
    default:
      throw new TypeError(`Unsupported reading position format: ${String(value.format)}`)
  }
}
