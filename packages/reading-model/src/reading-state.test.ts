import { describe, expect, it } from 'vitest'
import { assertReadingPosition } from './reading-state'

describe('reading position', () => {
  it('accepts a fixed-page position with progress inside the page', () => {
    const position: unknown = { format: 'pdf', pageNumber: 12, pageProgress: 0.375 }

    expect(() => assertReadingPosition(position)).not.toThrow()
    expect(position).toEqual({ format: 'pdf', pageNumber: 12, pageProgress: 0.375 })
  })

  it.each([
    { format: 'pdf', pageNumber: 12 },
    { format: 'pdf', pageNumber: 12, pageProgress: -0.01 },
    { format: 'cbz', pageNumber: 2, pageProgress: 1.01 },
  ])('rejects an invalid fixed-page position: %o', (position) => {
    expect(() => assertReadingPosition(position)).toThrow('page progress')
  })
})
