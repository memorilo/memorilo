import { describe, expect, it } from 'vitest'
import { blockIdFromContextTarget } from './context-menu-interactions'

describe('context menu interactions', () => {
  it('resolves the closest stable Outline block id', () => {
    const block = document.createElement('div')
    block.dataset.blockId = 'block-1'
    const child = block.appendChild(document.createElement('span'))
    const outside = document.createElement('span')

    expect(blockIdFromContextTarget(child)).toBe('block-1')
    expect(blockIdFromContextTarget(outside)).toBeNull()

    block.dataset.blockId = ''
    expect(() => blockIdFromContextTarget(child)).toThrow(
      'The context menu target block is missing its stable id',
    )
  })
})
