import type { ReaderAnnotation } from '../../types'
import { describe, expect, it } from 'vitest'
import { decodeTxtDocument } from './txt-document'

function textAnnotation(
  id: string,
  start: number,
  end: number,
  updatedAt: number,
): ReaderAnnotation {
  return {
    anchor: {
      end,
      format: 'txt',
      quote: { after: '', before: '', exact: '' },
      start,
      type: 'text',
    },
    color: 'yellow',
    createdAt: updatedAt,
    id,
    kind: 'highlight',
    updatedAt,
  }
}

describe('txt document', () => {
  it('decodes supported encodings and normalizes newlines', () => {
    const utf8 = decodeTxtDocument(new TextEncoder().encode('one\r\ntwo\rthree'))
    expect(utf8.text).toBe('one\ntwo\nthree')

    const utf16le = decodeTxtDocument(new Uint8Array([
      0xFF,
      0xFE,
      0x41,
      0x00,
      0x42,
      0x00,
    ]))
    expect(utf16le.text).toBe('AB')
  })

  it('rejects malformed text bytes', () => {
    expect(() => decodeTxtDocument(new Uint8Array([0xFF])))
      .toThrow('This TXT file is not valid UTF-8 or UTF-16 text')
  })

  it('builds quote context and validates ranges', () => {
    const document = decodeTxtDocument(new TextEncoder().encode('before exact after'))
    expect(document.textAnchor(7, 12)).toEqual({
      end: 12,
      format: 'txt',
      quote: { after: ' after', before: 'before ', exact: 'exact' },
      start: 7,
      type: 'text',
    })
    expect(() => document.textAnchor(12, 7)).toThrow(RangeError)
  })

  it('projects overlapping annotations using the most recently updated annotation', () => {
    const document = decodeTxtDocument(new TextEncoder().encode('abcdef'))
    const runs = document.annotationRuns([
      textAnnotation('older', 0, 4, 1),
      textAnnotation('newer', 2, 6, 2),
      textAnnotation('invalid', 8, 10, 3),
    ])

    expect(runs.map(run => ({ id: run.annotation?.id ?? null, text: run.text }))).toEqual([
      { id: 'older', text: 'ab' },
      { id: 'newer', text: 'cd' },
      { id: 'newer', text: 'ef' },
    ])
  })
})
