import type { ReaderAnnotation } from '../types'
import { describe, expect, it } from 'vitest'
import { annotationCopyText } from './annotation-copy'

const annotation: ReaderAnnotation = {
  anchor: {
    end: 13,
    format: 'txt',
    quote: { exact: 'Selected text' },
    start: 0,
    type: 'text',
  },
  color: 'yellow',
  createdAt: 1,
  id: 'annotation-1',
  style: 'highlight',
  updatedAt: 1,
}

describe('annotation copy text', () => {
  it('formats highlighted text with the publication title and location', () => {
    expect(annotationCopyText(annotation, 'text', 'Publication title', 'Page 3')).toBe('Selected text')
    expect(annotationCopyText(annotation, 'text-book', 'Publication title', 'Page 3')).toBe(
      'Selected text\n\nPublication title',
    )
    expect(annotationCopyText(annotation, 'text-book-location', 'Publication title', 'Page 3')).toBe(
      'Selected text\n\nPublication title - Page 3',
    )
  })
})
