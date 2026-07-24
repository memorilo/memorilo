import { describe, expect, it, vi } from 'vitest'

import { routeTree } from './routeTree.gen'

vi.mock('@memorilo/editor', () => ({
  demoEditorAdapters: {},
  Editor: () => null,
}))

vi.mock('./styles/app.stylex', () => ({ appStyles: {} }))

describe('route tree', () => {
  it('only exposes the editor at the root path', () => {
    const routes = Object.values(routeTree.children ?? {})

    expect(routes).toHaveLength(1)
    expect(routes[0]?.options.path).toBe('/')
  })
})
