import type { EditorCardProjection } from '../card/card-model'
import { describe, expect, it, vi } from 'vitest'
import { CardReviewRuntime } from '../card/card-review-runtime'
import { OutlineRuntime } from './outline-runtime'

const card = {
  back: [],
  blockHighlight: null,
  definitionId: 'definition',
  direction: 'forward',
  front: [],
  id: 'card',
  kind: 'basic',
  sourceBlockId: 'source',
} satisfies EditorCardProjection

describe('editor runtime listener isolation', () => {
  it('commits an Outline snapshot and notifies later listeners when one listener throws', () => {
    const runtime = new OutlineRuntime()
    const failure = new Error('detached outline view')
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const laterListener = vi.fn()
    runtime.subscribe(() => {
      throw failure
    })
    runtime.subscribe(laterListener)

    try {
      expect(() => runtime.setActive(true)).not.toThrow()
      expect(runtime.getSnapshot().active).toBe(true)
      expect(laterListener).toHaveBeenCalledOnce()
      expect(consoleError).toHaveBeenCalledWith('Outline runtime listener failed', failure)
    }
    finally {
      consoleError.mockRestore()
    }
  })

  it('commits Card review options and notifies later listeners when one listener throws', () => {
    const initial = { active: false, card, side: 'question' as const }
    const runtime = new CardReviewRuntime(initial)
    const failure = new Error('detached review view')
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const laterListener = vi.fn()
    runtime.subscribe(() => {
      throw failure
    })
    runtime.subscribe(laterListener)

    const next = { ...initial, active: true }
    try {
      expect(() => runtime.setOptions(next)).not.toThrow()
      expect(runtime.getSnapshot()).toBe(next)
      expect(laterListener).toHaveBeenCalledOnce()
      expect(consoleError).toHaveBeenCalledWith('Card review runtime listener failed', failure)
    }
    finally {
      consoleError.mockRestore()
    }
  })
})
