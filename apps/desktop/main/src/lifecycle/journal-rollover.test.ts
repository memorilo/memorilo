import { deferred } from '@memorilo/effect-lifecycle/testing'
import { afterEach, describe, expect, it, vi } from 'vitest'

interface FakeEmitter {
  emit: (event: string) => void
  listenerCount: (event: string) => number
  on: (event: string, listener: () => void) => void
  removeListener: (event: string, listener: () => void) => void
}

const electron = vi.hoisted(() => {
  const emitter = (): FakeEmitter => {
    const listeners = new Map<string, Set<() => void>>()
    return {
      emit: event => listeners.get(event)?.forEach(listener => listener()),
      listenerCount: event => listeners.get(event)?.size ?? 0,
      on: (event, listener) => {
        const eventListeners = listeners.get(event) ?? new Set()
        eventListeners.add(listener)
        listeners.set(event, eventListeners)
      },
      removeListener: (event, listener) => {
        listeners.get(event)?.delete(listener)
      },
    }
  }
  return { app: emitter(), powerMonitor: emitter() }
})

vi.mock('electron', () => electron)

const { installJournalRollover } = await import('./journal-rollover')

afterEach(() => {
  vi.useRealTimers()
})

describe('journal rollover', () => {
  it('stops triggers and shares close while draining an accepted check', async () => {
    vi.useFakeTimers()
    const checking = deferred()
    const openJournal = vi.fn(() => checking.promise)
    const rollover = installJournalRollover({ openJournal })

    electron.app.emit('browser-window-focus')
    await Promise.resolve()
    expect(openJournal).toHaveBeenCalledOnce()
    electron.powerMonitor.emit('resume')
    await Promise.resolve()
    expect(openJournal).toHaveBeenCalledOnce()

    const firstClose = rollover.close()
    expect(rollover.close()).toBe(firstClose)
    electron.powerMonitor.emit('resume')
    expect(openJournal).toHaveBeenCalledOnce()
    expect(electron.app.listenerCount('browser-window-focus')).toBe(0)
    expect(electron.powerMonitor.listenerCount('resume')).toBe(0)
    expect(vi.getTimerCount()).toBe(0)

    let closed = false
    void firstClose.then(() => {
      closed = true
    })
    await Promise.resolve()
    expect(closed).toBe(false)

    checking.resolve()
    await expect(firstClose).resolves.toBeUndefined()
    expect(closed).toBe(true)
  })
})
