import type { ReadingAnnotation } from './annotations'
import { describe, expect, it } from 'vitest'
import { assertReadingAnnotation, readingAnnotationText } from './annotations'

describe('reading annotation', () => {
  it('serializes one cross-page selection as ordered fragments of one annotation', () => {
    const annotation: ReadingAnnotation = {
      anchors: [
        {
          format: 'pdf',
          pageNumber: 4,
          quote: { exact: 'The end of page four' },
          rects: [{ height: 0.04, width: 0.4, x: 0.5, y: 0.9 }],
          source: 'embedded',
          type: 'text',
        },
        {
          format: 'pdf',
          pageNumber: 5,
          quote: { exact: 'and the start of page five.' },
          rects: [{ height: 0.04, width: 0.5, x: 0.1, y: 0.08 }],
          source: 'embedded',
          type: 'text',
        },
      ],
      color: 'yellow',
      createdAt: 100,
      id: 'cross-page',
      style: 'highlight',
      updatedAt: 100,
    }

    expect(() => assertReadingAnnotation(annotation)).not.toThrow()
    expect(readingAnnotationText(annotation)).toBe('The end of page four\nand the start of page five.')
    expect(JSON.parse(JSON.stringify(annotation))).toEqual(annotation)
  })

  it('rejects fragments from different formats', () => {
    const annotation: unknown = {
      anchors: [
        { end: 2, format: 'txt', quote: { exact: 'a' }, start: 1, type: 'text' },
        {
          format: 'pdf',
          pageNumber: 1,
          quote: { exact: 'b' },
          rects: [{ height: 0.1, width: 0.1, x: 0, y: 0 }],
          source: 'embedded',
          type: 'text',
        },
      ],
      color: 'yellow',
      createdAt: 100,
      id: 'mixed-format',
      style: 'highlight',
      updatedAt: 100,
    }

    expect(() => assertReadingAnnotation(annotation)).toThrow('same format and type')
  })
})
