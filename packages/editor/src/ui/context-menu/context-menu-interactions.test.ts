import { describe, expect, it } from 'vitest'
import {
  blockIdFromContextTarget,
  keepContextMenuInViewport,
} from './context-menu-interactions'

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

  it('keeps a menu inside the viewport edge', () => {
    const menu = document.createElement('div')
    Object.defineProperty(menu, 'getBoundingClientRect', {
      value: () => ({ height: 80, width: 120 }),
    })

    keepContextMenuInViewport(menu, { x: -20, y: -10 })
    expect(menu.style.left).toBe('8px')
    expect(menu.style.top).toBe('8px')

    keepContextMenuInViewport(menu, {
      x: window.innerWidth + 20,
      y: window.innerHeight + 10,
    })
    expect(menu.style.left).toBe(`${window.innerWidth - 128}px`)
    expect(menu.style.top).toBe(`${window.innerHeight - 88}px`)
  })
})
