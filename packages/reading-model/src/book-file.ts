import type { ReadingFormat } from './format'
import { assertReadingFormat } from './format'
import { isRecord } from './validation'

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

export interface BookFileBindingValidationOptions {
  requireRetrievalHint?: boolean
  requireShelfRetrievalHint?: boolean
}

function assertNonEmptyBindingString(value: unknown, description: string): asserts value is string {
  if (typeof value !== 'string' || value.trim().length === 0)
    throw new TypeError(`${description} must be a non-empty string`)
}

/** Validates the persisted book binding shape shared by editor, storage, and shelf. */
export function assertBookFileBinding(
  value: unknown,
  description: string,
  options: BookFileBindingValidationOptions = {},
): asserts value is BookFileBinding {
  if (!isRecord(value))
    throw new TypeError(`${description} must be an object`)
  if (!isRecord(value.book))
    throw new TypeError(`${description} publication metadata must be an object`)
  assertNonEmptyBindingString(value.book.title, `${description} publication title`)
  if (!Array.isArray(value.book.authors))
    throw new TypeError(`${description} authors must be an array`)
  value.book.authors.forEach((author, index) => (
    assertNonEmptyBindingString(author, `${description} author ${index}`)
  ))

  if (!isRecord(value.file))
    throw new TypeError(`${description} file must be an object`)
  assertNonEmptyBindingString(value.file.format, `${description} format`)
  assertReadingFormat(value.file.format)
  assertNonEmptyBindingString(value.file.sha256, `${description} SHA-256`)
  assertBookFileSha256(value.file.sha256)
  if (typeof value.file.byteLength !== 'number'
    || !Number.isSafeInteger(value.file.byteLength)
    || value.file.byteLength < 1) {
    throw new RangeError(`${description} byte length must be a positive safe integer`)
  }
  assertNonEmptyBindingString(value.file.originalName, `${description} original file name`)

  if (!Array.isArray(value.retrievalHints))
    throw new TypeError(`${description} retrieval hints must be an array`)
  if (options.requireRetrievalHint && value.retrievalHints.length === 0)
    throw new TypeError(`${description} must contain a retrieval hint`)
  let hasShelfHint = false
  for (const [index, hint] of value.retrievalHints.entries()) {
    if (!isRecord(hint))
      throw new TypeError(`${description} retrieval hint ${index} must be an object`)
    assertNonEmptyBindingString(hint.readingId, `${description} retrieval hint ${index} reading id`)
    if (hint.kind === 'shelf') {
      hasShelfHint = true
      assertNonEmptyBindingString(hint.publicationId, `${description} retrieval hint ${index} publication id`)
      assertNonEmptyBindingString(hint.sourceId, `${description} retrieval hint ${index} source id`)
    }
    else if (hint.kind !== 'local') {
      throw new TypeError(`${description} retrieval hint ${index} has an unknown kind`)
    }
  }
  if (options.requireShelfRetrievalHint && !hasShelfHint)
    throw new TypeError(`${description} must contain a Shelf retrieval hint`)
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
