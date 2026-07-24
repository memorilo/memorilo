import { describe, expect, it } from 'vitest'

describe('loro build compatibility', () => {
  it('loads collaboration exports without enabling them in production code', async () => {
    const [{ LoroDoc }, { CursorAwareness }] = await Promise.all([
      import('loro-crdt'),
      import('loro-prosemirror'),
    ])

    expect(typeof LoroDoc).toBe('function')
    expect(typeof CursorAwareness).toBe('function')
  })
})
