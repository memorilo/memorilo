import type { ShutdownEvent, ShutdownWindow } from './shutdown-state-machine'
import { deferred } from '@memorilo/effect-lifecycle/testing'
import { describe, expect, it, vi } from 'vitest'
import { createShutdownStateMachine } from './shutdown-state-machine'

function windowFixture() {
  const close = vi.fn()
  const setEnabled = vi.fn()
  let destroyed = false
  const window: ShutdownWindow = {
    close,
    isDestroyed: () => destroyed,
    setEnabled,
    webContents: { isDestroyed: () => destroyed },
  }
  return {
    close,
    destroy: () => {
      destroyed = true
    },
    setEnabled,
    window,
  }
}

function eventFixture(): ShutdownEvent {
  return { preventDefault: vi.fn() }
}

describe('shutdown state machine', () => {
  it('coalesces repeated close events for one window', async () => {
    const window = windowFixture()
    const save = deferred<boolean>()
    const saveWindow = vi.fn(() => save.promise)
    const machine = createShutdownStateMachine({
      closeRuntime: vi.fn(async () => undefined),
      getWindows: () => [window.window],
      onError: vi.fn(),
      quit: vi.fn(),
      saveAllWindows: vi.fn(async () => true),
      saveWindow,
    })
    const first = eventFixture()
    const second = eventFixture()

    machine.handleWindowClose(window.window, first)
    machine.handleWindowClose(window.window, second)

    expect(first.preventDefault).toHaveBeenCalledOnce()
    expect(second.preventDefault).toHaveBeenCalledOnce()
    expect(saveWindow).toHaveBeenCalledOnce()
    expect(window.setEnabled).toHaveBeenCalledWith(false)

    save.resolve(true)
    await vi.waitFor(() => expect(window.close).toHaveBeenCalledOnce())
    expect(window.setEnabled).toHaveBeenCalledTimes(1)
  })

  it('restores a cancelled window and permits a retry', async () => {
    const window = windowFixture()
    const saveWindow = vi.fn()
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true)
    const machine = createShutdownStateMachine({
      closeRuntime: vi.fn(async () => undefined),
      getWindows: () => [window.window],
      onError: vi.fn(),
      quit: vi.fn(),
      saveAllWindows: vi.fn(async () => true),
      saveWindow,
    })

    machine.handleWindowClose(window.window, eventFixture())
    await vi.waitFor(() => expect(window.setEnabled).toHaveBeenLastCalledWith(true))
    machine.handleWindowClose(window.window, eventFixture())
    await vi.waitFor(() => expect(window.close).toHaveBeenCalledOnce())
    expect(saveWindow).toHaveBeenCalledTimes(2)
  })

  it('isolates window state failures without losing close retry admission', async () => {
    const window = windowFixture()
    const restoreFailure = new Error('window manager unavailable')
    window.setEnabled.mockImplementation((enabled) => {
      if (enabled)
        throw restoreFailure
    })
    const saveWindow = vi.fn()
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true)
    const onError = vi.fn()
    const machine = createShutdownStateMachine({
      closeRuntime: vi.fn(async () => undefined),
      getWindows: () => [window.window],
      onError,
      quit: vi.fn(),
      saveAllWindows: vi.fn(async () => true),
      saveWindow,
    })

    machine.handleWindowClose(window.window, eventFixture())
    await vi.waitFor(() => expect(onError).toHaveBeenCalledWith(
      'Failed to restore a window after shutdown was cancelled',
      restoreFailure,
    ))
    machine.handleWindowClose(window.window, eventFixture())

    await vi.waitFor(() => expect(window.close).toHaveBeenCalledOnce())
    expect(saveWindow).toHaveBeenCalledTimes(2)
  })

  it('shares application quit and allows a failed shutdown to retry', async () => {
    const window = windowFixture()
    const save = deferred<boolean>()
    const closeRuntime = vi.fn()
      .mockRejectedValueOnce(new Error('runtime close failed'))
      .mockResolvedValueOnce(undefined)
    const quit = vi.fn()
    const onError = vi.fn()
    const machine = createShutdownStateMachine({
      closeRuntime,
      getWindows: () => [window.window],
      onError,
      quit,
      saveAllWindows: vi.fn(() => save.promise),
      saveWindow: vi.fn(async () => true),
    })

    const first = machine.requestApplicationQuit()
    const second = machine.requestApplicationQuit()
    expect(first).toBe(second)
    expect(window.setEnabled).toHaveBeenCalledWith(false)
    save.resolve(true)
    await expect(first).resolves.toBe(false)
    expect(onError).toHaveBeenCalledWith('Failed to shut down Memorilo cleanly', expect.any(Error))
    expect(window.setEnabled).toHaveBeenLastCalledWith(true)

    const retry = machine.requestApplicationQuit()
    await expect(retry).resolves.toBe(true)
    expect(closeRuntime).toHaveBeenCalledTimes(2)
    expect(quit).toHaveBeenCalledOnce()
    expect(machine.isQuitting()).toBe(true)
  })

  it('retries quit without closing the runtime twice when quit throws', async () => {
    const window = windowFixture()
    const closeRuntime = vi.fn(async () => undefined)
    const quitFailure = new Error('quit rejected by host')
    const quit = vi.fn()
      .mockImplementationOnce(() => {
        throw quitFailure
      })
      .mockImplementationOnce(() => undefined)
    const onError = vi.fn()
    const machine = createShutdownStateMachine({
      closeRuntime,
      getWindows: () => [window.window],
      onError,
      quit,
      saveAllWindows: vi.fn(async () => true),
      saveWindow: vi.fn(async () => true),
    })

    await expect(machine.requestApplicationQuit()).resolves.toBe(false)
    expect(machine.isQuitting()).toBe(false)
    expect(onError).toHaveBeenCalledWith('Failed to shut down Memorilo cleanly', quitFailure)

    await expect(machine.requestApplicationQuit()).resolves.toBe(true)
    expect(closeRuntime).toHaveBeenCalledOnce()
    expect(quit).toHaveBeenCalledTimes(2)
    expect(machine.isQuitting()).toBe(true)
  })

  it('does not start a window save while application shutdown is in flight', async () => {
    const window = windowFixture()
    const saveAll = deferred<boolean>()
    const saveWindow = vi.fn(async () => true)
    const machine = createShutdownStateMachine({
      closeRuntime: vi.fn(async () => undefined),
      getWindows: () => [window.window],
      onError: vi.fn(),
      quit: vi.fn(),
      saveAllWindows: () => saveAll.promise,
      saveWindow,
    })
    const beforeQuit = eventFixture()
    machine.handleBeforeQuit(beforeQuit)
    const close = eventFixture()
    machine.handleWindowClose(window.window, close)

    expect(beforeQuit.preventDefault).toHaveBeenCalledOnce()
    expect(close.preventDefault).toHaveBeenCalledOnce()
    expect(saveWindow).not.toHaveBeenCalled()
    saveAll.resolve(true)
    await machine.requestApplicationQuit()
  })
})
