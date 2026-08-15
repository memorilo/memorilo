import { describe, expect, it } from 'vitest'
import { boundReaderPresentation } from './bound-reader-presentation'

describe('bound Reader presentation', () => {
  it('keeps the publication title separate from the Reader heading', () => {
    expect(boundReaderPresentation({
      bookTitle: 'The Publication',
      noteTitle: 'Research Note',
      topicTitle: 'Chapter Context',
    })).toEqual({
      annotationCopyBookTitle: 'The Publication',
      title: 'Research Note · Chapter Context',
    })
  })
})
