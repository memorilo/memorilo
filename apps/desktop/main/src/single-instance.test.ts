import { describe, expect, it, vi } from 'vitest'

import { acquireSingleInstance, showPrimaryWindow } from './single-instance'

describe('single-instance startup', () => {
  it('quits a secondary process before application services are opened', () => {
    const app = {
      quit: vi.fn(),
      requestSingleInstanceLock: vi.fn(() => false),
    }

    expect(acquireSingleInstance(app)).toBe(false)
    expect(app.requestSingleInstanceLock).toHaveBeenCalledOnce()
    expect(app.quit).toHaveBeenCalledOnce()
  })

  it('allows the primary process to continue', () => {
    const app = {
      quit: vi.fn(),
      requestSingleInstanceLock: vi.fn(() => true),
    }

    expect(acquireSingleInstance(app)).toBe(true)
    expect(app.quit).not.toHaveBeenCalled()
  })

  it('restores and focuses the primary window after a second launch', () => {
    const window = {
      focus: vi.fn(),
      isMinimized: vi.fn(() => true),
      restore: vi.fn(),
      show: vi.fn(),
    }

    showPrimaryWindow(window)

    expect(window.restore).toHaveBeenCalledOnce()
    expect(window.show).toHaveBeenCalledOnce()
    expect(window.focus).toHaveBeenCalledOnce()
  })
})
