import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const instances: unknown[] = []
  class MockTray {
    handlers = new Map<string, Array<(...args: unknown[]) => void>>()
    destroy = vi.fn()
    getBounds = vi.fn(() => ({ height: 24, width: 24, x: 100, y: 0 }))
    popUpContextMenu = vi.fn()
    setToolTip = vi.fn()

    constructor() {
      instances.push(this)
    }

    emit(event: string, ...args: unknown[]) {
      for (const handler of this.handlers.get(event) ?? [])
        handler(...args)
    }

    on(event: string, handler: (...args: unknown[]) => void) {
      this.handlers.set(event, [...this.handlers.get(event) ?? [], handler])
      return this
    }
  }
  return {
    contextMenu: {},
    instances,
    MockTray,
  }
})

vi.mock('electron', () => ({
  Menu: {
    buildFromTemplate: vi.fn(() => mocks.contextMenu),
  },
  nativeImage: {
    createFromDataURL: vi.fn(() => ({ resize: vi.fn(() => ({})) })),
    createFromNamedImage: vi.fn(() => ({ resize: vi.fn(() => ({})) })),
  },
  Tray: mocks.MockTray,
}))

const { createTrayController } = await import('./tray-controller')

describe('tray controller', () => {
  beforeEach(() => {
    mocks.instances.length = 0
  })

  it('delivers separate clicks to the panel toggle', () => {
    const onTogglePanel = vi.fn()
    createTrayController({
      onOpenMainWindow: vi.fn(),
      onQuit: vi.fn(),
      onTogglePanel,
      onTrayMouseDown: vi.fn(),
    })
    const tray = mocks.instances[0] as InstanceType<typeof mocks.MockTray>

    tray.emit('click')
    tray.emit('click')

    expect(onTogglePanel).toHaveBeenCalledTimes(2)
    expect(onTogglePanel).toHaveBeenNthCalledWith(1, tray.getBounds())
    expect(onTogglePanel).toHaveBeenNthCalledWith(2, tray.getBounds())
  })

  it('opens the context menu only for right-click', () => {
    const onTogglePanel = vi.fn()
    createTrayController({
      onOpenMainWindow: vi.fn(),
      onQuit: vi.fn(),
      onTogglePanel,
      onTrayMouseDown: vi.fn(),
    })
    const tray = mocks.instances[0] as InstanceType<typeof mocks.MockTray>

    tray.emit('right-click')

    expect(tray.popUpContextMenu).toHaveBeenCalledWith(mocks.contextMenu)
    expect(onTogglePanel).not.toHaveBeenCalled()
  })

  it('toggles the panel on the first click and opens the main window on double-click', () => {
    const onOpenMainWindow = vi.fn()
    const onTogglePanel = vi.fn()
    createTrayController({
      onOpenMainWindow,
      onQuit: vi.fn(),
      onTogglePanel,
      onTrayMouseDown: vi.fn(),
    })
    const tray = mocks.instances[0] as InstanceType<typeof mocks.MockTray>
    tray.emit('click')
    tray.emit('double-click')

    expect(onTogglePanel).toHaveBeenCalledOnce()
    expect(onOpenMainWindow).toHaveBeenCalledOnce()
  })
})
