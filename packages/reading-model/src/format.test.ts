import { describe, expect, it } from 'vitest'
import {
  createReadingFileAccept,
  detectReadingFormat,
  readingFormatFromFileName,
  readingFormatFromMediaType,
} from './format'

describe('reading format', () => {
  it('normalizes file extensions and media types', () => {
    expect(readingFormatFromFileName('BOOK.EPUB')).toBe('epub')
    expect(readingFormatFromMediaType('application/pdf; charset=binary')).toBe('pdf')
    expect(readingFormatFromMediaType('application/octet-stream')).toBeNull()
  })

  it('prefers signatures while preserving ZIP-based extension intent', () => {
    expect(detectReadingFormat(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2D]), 'book.epub')).toBe('pdf')
    expect(detectReadingFormat(new Uint8Array([0x50, 0x4B, 0x03, 0x04]), 'comic.cbz')).toBe('cbz')
    expect(detectReadingFormat(new Uint8Array([0x50, 0x4B, 0x03, 0x04]), 'book.epub')).toBe('epub')
  })

  it('builds a deduplicated file picker accept list', () => {
    expect(createReadingFileAccept(['pdf', 'pdf'])).toBe('.pdf,application/pdf')
  })
})
