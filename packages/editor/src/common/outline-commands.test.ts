import type { NodeJSON } from 'prosekit/core'
import { describe, expect, it } from 'vitest'

import { planOutdent } from './outline-commands'

interface Shape {
  id: string
  kind: string
  children?: Shape[]
}

function block(id: string, children: NodeJSON[] = [], kind = 'outline'): NodeJSON {
  return {
    type: 'list',
    attrs: { blockId: id, checked: false, collapsed: false, kind, order: null },
    content: [
      { type: 'paragraph', content: [{ type: 'text', text: id }] },
      ...children,
    ],
  }
}

function doc(...blocks: NodeJSON[]): NodeJSON {
  return { type: 'doc', content: blocks }
}

function shape(document: NodeJSON): Shape[] {
  const readBlock = (node: NodeJSON): Shape => {
    const id = node.attrs?.blockId
    const kind = node.attrs?.kind
    if (typeof id !== 'string' || typeof kind !== 'string')
      throw new Error('Expected a normalized outline block')
    const children = node.content?.filter(child => child.type === 'list').map(readBlock) ?? []
    return children.length > 0 ? { id, kind, children } : { id, kind }
  }

  return document.content?.map(readBlock) ?? []
}

describe('planOutdent', () => {
  it('logical outdent promotes only the selected block and keeps unselected siblings with their parent', () => {
    const document = doc(
      block('P', [
        block('A'),
        block('B', [block('X')]),
        block('C'),
        block('D'),
      ]),
      block('E'),
    )

    const result = planOutdent(document, ['B'], { behavior: 'logical' })

    expect(result.status).toBe('ready')
    if (result.status !== 'ready')
      throw new Error(`Outdent was blocked: ${result.reason}`)
    expect(result.movedBlockIds).toEqual(['B'])
    expect(shape(result.document)).toEqual([
      { id: 'P', kind: 'outline', children: [{ id: 'A', kind: 'outline' }, { id: 'C', kind: 'outline' }, { id: 'D', kind: 'outline' }] },
      { id: 'B', kind: 'outline', children: [{ id: 'X', kind: 'outline' }] },
      { id: 'E', kind: 'outline' },
    ])
  })

  it('traditional outdent keeps visible order by appending right siblings to the selected block', () => {
    const document = doc(
      block('P', [
        block('A'),
        block('B', [block('X')]),
        block('C'),
        block('D'),
      ]),
      block('E'),
    )

    const result = planOutdent(document, ['B'], { behavior: 'traditional' })

    expect(result.status).toBe('ready')
    if (result.status !== 'ready')
      throw new Error(`Outdent was blocked: ${result.reason}`)
    expect(shape(result.document)).toEqual([
      { id: 'P', kind: 'outline', children: [{ id: 'A', kind: 'outline' }] },
      {
        id: 'B',
        kind: 'outline',
        children: [
          { id: 'X', kind: 'outline' },
          { id: 'C', kind: 'outline' },
          { id: 'D', kind: 'outline' },
        ],
      },
      { id: 'E', kind: 'outline' },
    ])
  })

  it('traditional outdent appends trailing siblings to the last block in a continuous selection', () => {
    const document = doc(block('P', [block('A'), block('B'), block('C', [block('X')]), block('D'), block('E')]))

    const result = planOutdent(document, ['B', 'C'], { behavior: 'traditional' })

    expect(result.status).toBe('ready')
    if (result.status !== 'ready')
      throw new Error(`Outdent was blocked: ${result.reason}`)
    expect(shape(result.document)).toEqual([
      { id: 'P', kind: 'outline', children: [{ id: 'A', kind: 'outline' }] },
      { id: 'B', kind: 'outline' },
      {
        id: 'C',
        kind: 'outline',
        children: [
          { id: 'X', kind: 'outline' },
          { id: 'D', kind: 'outline' },
          { id: 'E', kind: 'outline' },
        ],
      },
    ])
  })

  it('logical outdent atomically promotes a non-contiguous selection in source order', () => {
    const document = doc(block('P', [block('A'), block('B'), block('C'), block('D'), block('E')]), block('Q'))

    const result = planOutdent(document, ['D', 'B'], { behavior: 'logical' })

    expect(result.status).toBe('ready')
    if (result.status !== 'ready')
      throw new Error(`Outdent was blocked: ${result.reason}`)
    expect(result.movedBlockIds).toEqual(['B', 'D'])
    expect(shape(result.document)).toEqual([
      { id: 'P', kind: 'outline', children: [{ id: 'A', kind: 'outline' }, { id: 'C', kind: 'outline' }, { id: 'E', kind: 'outline' }] },
      { id: 'B', kind: 'outline' },
      { id: 'D', kind: 'outline' },
      { id: 'Q', kind: 'outline' },
    ])
  })

  it('blocks non-contiguous traditional outdent with a stable reason', () => {
    const document = doc(block('P', [block('A'), block('B'), block('C'), block('D')]))

    expect(planOutdent(document, ['B', 'D'], { behavior: 'traditional' })).toEqual({
      status: 'blocked',
      reason: 'traditional_requires_contiguous_siblings',
    })
    expect(shape(document)).toEqual([
      {
        id: 'P',
        kind: 'outline',
        children: [
          { id: 'A', kind: 'outline' },
          { id: 'B', kind: 'outline' },
          { id: 'C', kind: 'outline' },
          { id: 'D', kind: 'outline' },
        ],
      },
    ])
  })

  it('normalizes an ancestor and descendant selection to the ancestor subtree', () => {
    const document = doc(block('P', [block('A'), block('B', [block('X')]), block('C')]))

    const result = planOutdent(document, ['B', 'X'], { behavior: 'logical' })

    expect(result.status).toBe('ready')
    if (result.status !== 'ready')
      throw new Error(`Outdent was blocked: ${result.reason}`)
    expect(result.movedBlockIds).toEqual(['B'])
    expect(shape(result.document)).toEqual([
      { id: 'P', kind: 'outline', children: [{ id: 'A', kind: 'outline' }, { id: 'C', kind: 'outline' }] },
      { id: 'B', kind: 'outline', children: [{ id: 'X', kind: 'outline' }] },
    ])
  })

  it('does not let a focused root or its direct children escape the projection', () => {
    const document = doc(block('F', [block('A', [block('B')])]))

    expect(planOutdent(document, ['F'], { behavior: 'logical', viewRootId: 'F' })).toEqual({
      status: 'blocked',
      reason: 'already_at_root',
    })
    expect(planOutdent(document, ['A'], { behavior: 'logical', viewRootId: 'F' })).toEqual({
      status: 'blocked',
      reason: 'crosses_focus_root',
    })
    const nested = planOutdent(document, ['B'], { behavior: 'logical', viewRootId: 'F' })
    expect(nested.status).toBe('ready')
    if (nested.status !== 'ready')
      throw new Error(`Outdent was blocked: ${nested.reason}`)
    expect(shape(nested.document)).toEqual([
      {
        id: 'F',
        kind: 'outline',
        children: [{ id: 'A', kind: 'outline' }, { id: 'B', kind: 'outline' }],
      },
    ])
  })

  it('preserves ordered-list semantics while changing structure', () => {
    const document = doc(block('P', [block('A'), block('B', [], 'ordered'), block('C', [], 'ordered')]))

    const result = planOutdent(document, ['B'], { behavior: 'logical' })

    expect(result.status).toBe('ready')
    if (result.status !== 'ready')
      throw new Error(`Outdent was blocked: ${result.reason}`)
    expect(shape(result.document)).toEqual([
      { id: 'P', kind: 'outline', children: [{ id: 'A', kind: 'outline' }, { id: 'C', kind: 'ordered' }] },
      { id: 'B', kind: 'ordered' },
    ])
  })

  it('rejects a Traditional selection that crosses parents', () => {
    const document = doc(
      block('P', [block('A'), block('B')]),
      block('Q', [block('C'), block('D')]),
    )

    expect(planOutdent(document, ['B', 'D'], { behavior: 'traditional' })).toEqual({
      status: 'blocked',
      reason: 'traditional_requires_same_parent',
    })
  })

  it('logically outdents blocks from different parents and depths in document order', () => {
    const document = doc(
      block('P', [block('A'), block('B', [block('X'), block('Y')]), block('C')]),
      block('Q', [block('D'), block('E')]),
    )

    const result = planOutdent(document, ['Y', 'E'], { behavior: 'logical' })

    expect(result.status).toBe('ready')
    if (result.status !== 'ready')
      throw new Error(`Outdent was blocked: ${result.reason}`)
    expect(result.movedBlockIds).toEqual(['Y', 'E'])
    expect(shape(result.document)).toEqual([
      {
        id: 'P',
        kind: 'outline',
        children: [
          { id: 'A', kind: 'outline' },
          { id: 'B', kind: 'outline', children: [{ id: 'X', kind: 'outline' }] },
          { id: 'Y', kind: 'outline' },
          { id: 'C', kind: 'outline' },
        ],
      },
      { id: 'Q', kind: 'outline', children: [{ id: 'D', kind: 'outline' }] },
      { id: 'E', kind: 'outline' },
    ])
  })

  it('blocks the whole Logical transaction when any selected block cannot move', () => {
    const document = doc(block('P', [block('A'), block('B')]), block('Q'))
    const before = structuredClone(document)

    expect(planOutdent(document, ['B', 'Q'], { behavior: 'logical' })).toEqual({
      status: 'blocked',
      reason: 'already_at_root',
    })
    expect(document).toEqual(before)
  })

  it('returns stable reasons for empty and unknown selections', () => {
    const document = doc(block('P', [block('A')]))

    expect(planOutdent(document, [], { behavior: 'logical' })).toEqual({
      status: 'blocked',
      reason: 'empty_selection',
    })
    expect(planOutdent(document, ['missing'], { behavior: 'logical' })).toEqual({
      status: 'blocked',
      reason: 'unknown_selected_block',
    })
  })
})
