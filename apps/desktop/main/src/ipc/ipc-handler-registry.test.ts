import type { WebContents } from 'electron'
import type { DesktopIpcHandlers, IpcHandlerHost } from './ipc-handler-registry'
import { desktopIpcChannels } from '@memorilo/desktop-preload/ipc'
import { describe, expect, it, vi } from 'vitest'
import { createIpcHandlerRegistry, withIpcContext } from './ipc-handler-registry'

type RegisteredHandler = Parameters<IpcHandlerHost['handle']>[1]

function fakeHost() {
  const handlers = new Map<string, RegisteredHandler>()
  return {
    handlers,
    handle(channel: string, handler: RegisteredHandler) {
      if (handlers.has(channel))
        throw new Error(`Handler already exists: ${channel}`)
      handlers.set(channel, handler)
    },
    removeHandler(channel: string) {
      if (!handlers.delete(channel))
        throw new Error(`Handler is missing: ${channel}`)
    },
  }
}

function handlerStub(): DesktopIpcHandlers {
  return Object.fromEntries(
    Object.entries(desktopIpcChannels).map(([group, channels]) => [
      group,
      Object.fromEntries(Object.keys(channels).map(method => [method, vi.fn()])),
    ]),
  ) as unknown as DesktopIpcHandlers
}

const sender = {} as WebContents

describe('ipc handler registry', () => {
  it('registers stable channels and passes sender context explicitly', async () => {
    const host = fakeHost()
    const baseHandlers = handlerStub()
    const fetch = vi.fn((_request: unknown) => ({ body: '{}', headers: [], status: 200, statusText: 'OK' }))
    const handlers: DesktopIpcHandlers = {
      ...baseHandlers,
      transport: {
        fetch: withIpcContext((context, request) => {
          expect(context.sender).toBe(sender)
          return fetch(request)
        }),
      },
    }
    const registry = await createIpcHandlerRegistry(handlers, { host })

    const channel = desktopIpcChannels.transport.fetch
    const request = { body: null, headers: [], method: 'GET', url: 'memorilo://api/app/runtime' }
    await expect(host.handlers.get(channel)?.({ sender }, request)).resolves.toEqual({
      status: 'success',
      value: { body: '{}', headers: [], status: 200, statusText: 'OK' },
    })
    expect(channel).toBe('memorilo:invoke:transport:fetch')
    expect(fetch).toHaveBeenCalledWith(request)
    await registry.close()
  })

  it('owns handlers and shares concurrent close', async () => {
    const host = fakeHost()
    const registry = await createIpcHandlerRegistry(handlerStub(), { host })
    expect(host.handlers.size).toBeGreaterThan(0)

    const first = registry.close()
    const second = registry.close()
    expect(second).toBe(first)
    await Promise.all([first, second])
    expect(host.handlers.size).toBe(0)
    await registry.close()
  })

  it('rejects new calls and drains accepted handlers during close', async () => {
    const host = fakeHost()
    let release!: () => void
    const released = new Promise<void>((resolve) => {
      release = resolve
    })
    const baseHandlers = handlerStub()
    const handlers: DesktopIpcHandlers = {
      ...baseHandlers,
      transport: {
        fetch: withIpcContext(async () => {
          await released
          return { body: '{}', headers: [], status: 200, statusText: 'OK' }
        }),
      },
    }
    const registry = await createIpcHandlerRegistry(handlers, { host })
    const channel = desktopIpcChannels.transport.fetch
    const handler = host.handlers.get(channel)!
    const request = handler({ sender }, {
      body: null,
      headers: [],
      method: 'GET',
      url: 'memorilo://api/app/runtime',
    }) as Promise<unknown>
    const close = registry.close()

    let closed = false
    void close.then(() => {
      closed = true
    })
    await Promise.resolve()
    expect(host.handlers.has(channel)).toBe(true)
    expect(closed).toBe(false)
    await expect(handler({ sender }, {
      body: null,
      headers: [],
      method: 'GET',
      url: 'memorilo://api/app/runtime',
    })).resolves.toEqual({
      error: {
        code: 'Error',
        details: {},
        message: 'Desktop IPC transport is shutting down',
        name: 'Error',
      },
      status: 'failure',
    })

    release()
    await expect(request).resolves.toEqual({
      status: 'success',
      value: { body: '{}', headers: [], status: 200, statusText: 'OK' },
    })
    await close
    expect(host.handlers.has(channel)).toBe(false)
    expect(closed).toBe(true)
  })

  it('retains failed removals for a later shutdown retry', async () => {
    const host = fakeHost()
    const removeHandler = host.removeHandler
    const failedChannel = desktopIpcChannels.whiteboardLibrary.load
    let failedAttempts = 0
    vi.spyOn(host, 'removeHandler').mockImplementation((channel) => {
      if (channel === failedChannel && failedAttempts++ === 0)
        throw new Error('busy')
      removeHandler.call(host, channel)
    })
    const registry = await createIpcHandlerRegistry(handlerStub(), { host })

    await expect(registry.close()).rejects.toThrow('Failed to close IPC handler')
    expect(host.handlers.has(failedChannel)).toBe(true)
    await registry.close()
    expect(host.handlers.size).toBe(0)
  })

  it('rolls back handlers when registration fails', async () => {
    const host = fakeHost()
    const handle = host.handle
    let registrations = 0
    vi.spyOn(host, 'handle').mockImplementation((channel, handler) => {
      registrations += 1
      if (registrations === 3)
        throw new Error('registration failed')
      handle.call(host, channel, handler)
    })

    await expect(createIpcHandlerRegistry(handlerStub(), { host })).rejects.toThrow('registration failed')
    expect(host.handlers.size).toBe(0)
  })
})
