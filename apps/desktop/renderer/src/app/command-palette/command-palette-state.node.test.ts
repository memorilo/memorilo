import { describe, expect, it } from 'vitest'
import { initialCommandPaletteState, reduceCommandPaletteState } from './command-palette-state'

describe('command palette state', () => {
  it('resets transient state when a new session opens', () => {
    const opened = reduceCommandPaletteState(initialCommandPaletteState, { type: 'open' })
    const queried = reduceCommandPaletteState(opened, { query: 'old query', type: 'queryChanged' })
    const selected = reduceCommandPaletteState(queried, { selectedId: 'note:1', type: 'selectionChanged' })
    const pending = reduceCommandPaletteState(selected, { type: 'actionStarted' })
    const reopened = reduceCommandPaletteState(
      reduceCommandPaletteState(pending, { type: 'close' }),
      { type: 'open' },
    )

    expect(reopened).toEqual({
      action: 'idle',
      open: true,
      query: '',
      selectedId: null,
      sessionId: 2,
    })
  })

  it('ignores completion from a previous session', () => {
    const first = reduceCommandPaletteState(initialCommandPaletteState, { type: 'open' })
    const pending = reduceCommandPaletteState(first, { type: 'actionStarted' })
    const second = reduceCommandPaletteState(
      reduceCommandPaletteState(pending, { type: 'close' }),
      { type: 'open' },
    )

    expect(reduceCommandPaletteState(second, {
      sessionId: first.sessionId,
      type: 'actionSucceeded',
    })).toBe(second)
    expect(reduceCommandPaletteState(second, {
      sessionId: first.sessionId,
      type: 'actionFailed',
    })).toBe(second)
  })

  it('closes only after the current action succeeds', () => {
    const opened = reduceCommandPaletteState(initialCommandPaletteState, { type: 'open' })
    const pending = reduceCommandPaletteState(opened, { type: 'actionStarted' })

    expect(reduceCommandPaletteState(pending, {
      sessionId: pending.sessionId,
      type: 'actionSucceeded',
    })).toMatchObject({ action: 'idle', open: false })
    expect(reduceCommandPaletteState(pending, {
      sessionId: pending.sessionId,
      type: 'actionFailed',
    })).toMatchObject({ action: 'failed', open: true })
  })
})
