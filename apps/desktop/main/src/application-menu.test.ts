import { describe, expect, it, vi } from 'vitest'
import { installApplicationMenu } from './application-menu'

const mocks = vi.hoisted(() => ({
  buildFromTemplate: vi.fn((template: unknown) => template),
  setApplicationMenu: vi.fn(),
}))

vi.mock('electron', () => ({
  Menu: mocks,
  app: { name: 'Memorilo' },
}))

describe('application menu ownership', () => {
  it('returns a disposer that removes the installed menu', () => {
    const remove = installApplicationMenu(() => undefined)

    expect(mocks.setApplicationMenu).toHaveBeenCalledWith(expect.anything())
    remove()
    expect(mocks.setApplicationMenu).toHaveBeenLastCalledWith(null)
  })
})
