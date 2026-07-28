import type { NodeJSON } from 'prosekit/core'
import { describe, expect, it, vi } from 'vitest'

import { normalizeOutlineDocument } from './outline-document'

describe('normalizeOutlineDocument', () => {
  it('wraps ordinary document blocks without changing explicit list semantics', () => {
    const createId = vi.fn()
      .mockReturnValueOnce('block-paragraph')
      .mockReturnValueOnce('block-list')
    const document: NodeJSON = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'Plain' }] },
        {
          type: 'list',
          attrs: { kind: 'ordered', order: 3, checked: false, collapsed: false },
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Third' }] }],
        },
      ],
    }

    expect(normalizeOutlineDocument(document, createId)).toEqual({
      type: 'doc',
      content: [
        {
          type: 'list',
          attrs: {
            blockId: 'block-paragraph',
            checked: false,
            collapsed: false,
            kind: 'outline',
            order: null,
          },
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Plain' }] }],
        },
        {
          type: 'list',
          attrs: {
            blockId: 'block-list',
            checked: false,
            collapsed: false,
            kind: 'ordered',
            order: 3,
          },
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Third' }] }],
        },
      ],
    })
    expect(document.content?.[0]?.type).toBe('paragraph')
  })

  it('rejects duplicate block ids instead of making focus and selection ambiguous', () => {
    const document: NodeJSON = {
      type: 'doc',
      content: [
        {
          type: 'list',
          attrs: { blockId: 'duplicate', kind: 'outline' },
          content: [{ type: 'paragraph' }],
        },
        {
          type: 'list',
          attrs: { blockId: 'duplicate', kind: 'bullet' },
          content: [{ type: 'paragraph' }],
        },
      ],
    }

    expect(() => normalizeOutlineDocument(document)).toThrowError('Duplicate outline block id: duplicate')
  })

  it('is idempotent and assigns stable ids to nested semantic lists', () => {
    const document: NodeJSON = {
      type: 'doc',
      content: [
        {
          type: 'list',
          attrs: { blockId: 'parent', kind: 'bullet' },
          content: [
            { type: 'paragraph', content: [{ type: 'text', text: 'Parent' }] },
            {
              type: 'list',
              attrs: { kind: 'ordered', order: 4 },
              content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Child' }] }],
            },
          ],
        },
      ],
    }
    const first = normalizeOutlineDocument(document, () => 'child')
    const second = normalizeOutlineDocument(first, () => 'unused')

    expect(second).toEqual(first)
    expect(first.content?.[0]?.attrs).toMatchObject({ blockId: 'parent', kind: 'bullet' })
    expect(first.content?.[0]?.content?.[1]?.attrs).toMatchObject({ blockId: 'child', kind: 'ordered', order: 4 })
  })

  it('rejects an empty generated block id', () => {
    const document: NodeJSON = {
      type: 'doc',
      content: [{ type: 'paragraph' }],
    }

    expect(() => normalizeOutlineDocument(document, () => '')).toThrowError('Outline block ids must be non-empty strings')
  })
})
