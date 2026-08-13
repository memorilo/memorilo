import { describe, expect, it } from 'vitest'
import { assertBookFileBinding } from './index'

const binding = {
  book: { authors: ['Author'], title: 'Book' },
  file: {
    byteLength: 1,
    format: 'epub' as const,
    originalName: 'book.epub',
    sha256: 'a'.repeat(64),
  },
  retrievalHints: [],
}

describe('assertBookFileBinding', () => {
  it('accepts a binding without retrieval hints for persisted editor metadata', () => {
    expect(() => assertBookFileBinding(binding, 'binding')).not.toThrow()
  })

  it('enforces a shelf locator when a shelf owns the file', () => {
    const localBinding = {
      ...binding,
      retrievalHints: [{ kind: 'local' as const, readingId: 'reading' }],
    }
    expect(() => assertBookFileBinding(localBinding, 'binding', {
      requireRetrievalHint: true,
      requireShelfRetrievalHint: true,
    })).toThrow('Shelf retrieval hint')
  })

  it('validates the digest before accepting a binding', () => {
    expect(() => assertBookFileBinding({
      ...binding,
      file: { ...binding.file, sha256: 'not-a-digest' },
    }, 'binding')).toThrow('SHA-256')
  })
})
