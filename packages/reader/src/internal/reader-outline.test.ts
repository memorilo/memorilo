import { describe, expect, it } from 'vitest'
import { ReaderOutlineProjection } from './reader-outline'

describe('reader outline projection', () => {
  it('projects stable recursive ids and resolves their navigation targets', () => {
    const chapter = { page: 4 }
    const section = { page: 7 }
    const outline = new ReaderOutlineProjection('document', [{
      children: [{
        children: [],
        label: 'Section',
        navigable: true,
        target: section,
      }],
      href: '#chapter',
      label: 'Chapter',
      navigable: true,
      target: chapter,
    }], outlineItemId => new Error(`Unknown outline item: ${outlineItemId}`))

    expect(outline.items).toEqual([{
      children: [{
        children: [],
        href: undefined,
        id: 'document.0.0',
        label: 'Section',
        navigable: true,
      }],
      href: '#chapter',
      id: 'document.0',
      label: 'Chapter',
      navigable: true,
    }])
    expect(outline.requireTarget('document.0')).toBe(chapter)
    expect(outline.requireTarget('document.0.0')).toBe(section)
  })

  it('uses the format-specific error for unknown and non-navigable items', () => {
    const outline = new ReaderOutlineProjection('document', [{
      children: [],
      label: 'Heading',
      navigable: false,
    }], outlineItemId => new RangeError(`Cannot navigate to ${outlineItemId}`))

    expect(() => outline.requireTarget('document.0')).toThrow(
      new RangeError('Cannot navigate to document.0'),
    )
    expect(() => outline.requireTarget('document.9')).toThrow(
      new RangeError('Cannot navigate to document.9'),
    )
  })
})
