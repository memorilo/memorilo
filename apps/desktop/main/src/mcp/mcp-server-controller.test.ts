import type { NoteApplicationService } from '../notes/note-application-service'
import { describe, expect, it, vi } from 'vitest'
import {
  createMcpServerController,
  McpServerControllerClosedError,
} from './mcp-server-controller'

const token = '0123456789abcdef0123456789abcdef'
const notes = {} as NoteApplicationService

function configuration(overrides: Partial<{ accessToken: string, enabled: boolean, port: number }> = {}) {
  return { accessToken: token, enabled: false, port: 8765, ...overrides }
}

describe('server controller for MCP', () => {
  it('keeps MCP disabled by default and ignores equivalent updates', async () => {
    const start = vi.fn()
    const controller = createMcpServerController(notes, { start })

    await controller.update(configuration())
    await controller.update(configuration())
    expect(start).not.toHaveBeenCalled()
    await controller.close()
  })

  it('starts, restarts on MCP configuration changes, and stops when disabled', async () => {
    const stops: ReturnType<typeof vi.fn>[] = []
    const start = vi.fn(async () => {
      const stop = vi.fn(async () => undefined)
      stops.push(stop)
      return stop
    })
    const controller = createMcpServerController(notes, { start })

    await controller.update(configuration({ enabled: true }))
    await controller.update(configuration({ enabled: true }))
    expect(start).toHaveBeenCalledTimes(1)

    await controller.update(configuration({ enabled: true, port: 9876 }))
    expect(stops[0]).toHaveBeenCalledTimes(1)
    expect(start).toHaveBeenCalledTimes(2)

    await controller.update(configuration({ accessToken: `${token}changed`, enabled: true, port: 9876 }))
    expect(stops[1]).toHaveBeenCalledTimes(1)
    expect(start).toHaveBeenCalledTimes(3)

    await controller.update(configuration({ enabled: false }))
    expect(stops[2]).toHaveBeenCalledTimes(1)
    expect(start).toHaveBeenCalledTimes(3)
    await controller.close()
  })

  it('does not start a queued server after close begins', async () => {
    let releaseStart: (() => void) | undefined
    const start = vi.fn(async () => {
      await new Promise<void>((resolve) => {
        releaseStart = resolve
      })
      return vi.fn(async () => undefined)
    })
    const controller = createMcpServerController(notes, { start })

    const update = controller.update(configuration({ enabled: true }))
    await vi.waitFor(() => expect(start).toHaveBeenCalledTimes(1))
    const close = controller.close()
    releaseStart?.()
    await Promise.all([update, close])

    const stop = await start.mock.results[0]?.value
    expect(stop).toHaveBeenCalledTimes(1)
    const closedUpdate = controller.update(configuration({ enabled: true, port: 9001 }))
    await expect(closedUpdate).rejects.toBeInstanceOf(McpServerControllerClosedError)
    expect(start).toHaveBeenCalledTimes(1)
  })

  it('coalesces rapid updates so stale configurations never start', async () => {
    const events: string[] = []
    const onError = vi.fn()
    const start = vi.fn(async (value: { port: number }) => {
      events.push(`start:${value.port}`)
      if (value.port === 9000)
        throw new Error('occupied')
      return async () => {
        events.push(`stop:${value.port}`)
      }
    })
    const controller = createMcpServerController(notes, { onError, start })

    await Promise.all([
      controller.update(configuration({ enabled: true, port: 9000 })),
      controller.update(configuration({ enabled: true, port: 9001 })),
    ])
    expect(onError).not.toHaveBeenCalled()
    expect(events).toEqual(['start:9001'])

    await controller.close()
    expect(events).toEqual(['start:9001', 'stop:9001'])
  })

  it('stops a stale server that finishes starting after a newer update', async () => {
    let releaseStart!: () => void
    const start = vi.fn(async (value: { port: number }) => {
      if (value.port === 9000)
        await new Promise<void>(resolve => releaseStart = resolve)
      return async () => undefined
    })
    const controller = createMcpServerController(notes, { start })

    const first = controller.update(configuration({ enabled: true, port: 9000 }))
    await vi.waitFor(() => expect(start).toHaveBeenCalledWith(expect.objectContaining({ port: 9000 }), notes))
    const second = controller.update(configuration({ enabled: true, port: 9001 }))
    releaseStart()

    await Promise.all([first, second])
    expect(start).toHaveBeenCalledTimes(2)
    expect(start.mock.calls[1]?.[0]).toMatchObject({ port: 9001 })
    await controller.close()
  })

  it('retains ownership when stale transport cleanup fails so a later update retries it', async () => {
    let releaseStart!: () => void
    const startReleased = new Promise<void>((resolve) => {
      releaseStart = resolve
    })
    const cleanupFailure = new Error('stale transport busy')
    const staleStop = vi.fn()
      .mockRejectedValueOnce(cleanupFailure)
      .mockResolvedValue(undefined)
    const onError = vi.fn()
    const start = vi.fn(async (value: { port: number }) => {
      if (value.port === 9000) {
        await startReleased
        return staleStop
      }
      return async () => undefined
    })
    const controller = createMcpServerController(notes, { onError, start })

    const first = controller.update(configuration({ enabled: true, port: 9000 }))
    await vi.waitFor(() => expect(start).toHaveBeenCalledWith(expect.objectContaining({ port: 9000 }), notes))
    const second = controller.update(configuration({ enabled: true, port: 9001 }))
    releaseStart()
    await expect(first).rejects.toMatchObject({
      cause: cleanupFailure,
      message: 'Failed to close MCP transport',
    })
    await expect(second).rejects.toMatchObject({
      cause: cleanupFailure,
      message: 'Failed to close MCP transport',
    })

    expect(staleStop).toHaveBeenCalledOnce()
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'stale transport busy' }))
    await controller.update(configuration({ enabled: true, port: 9001 }))
    expect(staleStop).toHaveBeenCalledTimes(2)
    expect(start).toHaveBeenCalledTimes(2)
    await controller.close()
  })

  it('continues to the latest configuration when a stale start fails', async () => {
    let rejectStart!: (error: Error) => void
    const onError = vi.fn()
    const start = vi.fn((value: { port: number }) => {
      if (value.port === 9000) {
        return new Promise<() => Promise<void>>((_, reject) => {
          rejectStart = reject
        })
      }
      return Promise.resolve(async () => undefined)
    })
    const controller = createMcpServerController(notes, { onError, start })

    const first = controller.update(configuration({ enabled: true, port: 9000 }))
    await vi.waitFor(() => expect(start).toHaveBeenCalledWith(expect.objectContaining({ port: 9000 }), notes))
    const second = controller.update(configuration({ enabled: true, port: 9001 }))
    rejectStart(new Error('occupied'))

    await Promise.all([first, second])
    expect(start).toHaveBeenCalledTimes(2)
    expect(start.mock.calls[1]?.[0]).toMatchObject({ port: 9001 })
    expect(onError).not.toHaveBeenCalled()
    await controller.close()
  })

  it('shares handled failures between equivalent pending updates', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    let rejectStart!: (error: Error) => void
    const start = vi.fn(() => new Promise<() => Promise<void>>((_, reject) => {
      rejectStart = reject
    }))
    const onError = vi.fn(() => {
      throw new Error('reporter failed')
    })
    const controller = createMcpServerController(notes, { onError, start })
    const target = configuration({ enabled: true })

    const first = controller.update(target)
    const equivalent = controller.update({ ...target })
    expect(equivalent).toBe(first)
    await vi.waitFor(() => expect(start).toHaveBeenCalledOnce())
    const failure = new Error('occupied')
    rejectStart(failure)

    await expect(first).rejects.toBe(failure)
    await expect(equivalent).rejects.toBe(failure)
    expect(onError).toHaveBeenCalledOnce()
    expect(consoleError).toHaveBeenCalledWith(
      'Failed to report MCP server error',
      expect.objectContaining({ message: 'reporter failed' }),
    )
    await controller.close()
    consoleError.mockRestore()
  })

  it('makes concurrent close calls share the same queued cleanup', async () => {
    let releaseStop!: () => void
    const stopReleased = new Promise<void>((resolve) => {
      releaseStop = resolve
    })
    const stop = vi.fn(async () => stopReleased)
    const start = vi.fn(async () => stop)
    const controller = createMcpServerController(notes, { start })

    await controller.update(configuration({ enabled: true }))
    const firstClose = controller.close()
    const secondClose = controller.close()
    let secondFinished = false
    void secondClose.then(() => {
      secondFinished = true
    })

    await vi.waitFor(() => expect(stop).toHaveBeenCalledOnce())
    expect(secondFinished).toBe(false)
    releaseStop()
    await Promise.all([firstClose, secondClose])
    expect(secondFinished).toBe(true)
    expect(stop).toHaveBeenCalledOnce()
  })

  it('does not start a replacement while shutdown overlaps a pending stop', async () => {
    let releaseStop!: () => void
    const stop = vi.fn(() => new Promise<void>((resolve) => {
      releaseStop = resolve
    }))
    const start = vi.fn(async (value: { port: number }) => (
      value.port === 8765 ? stop : vi.fn(async () => undefined)
    ))
    const controller = createMcpServerController(notes, { start })

    await controller.update(configuration({ enabled: true }))
    const update = controller.update(configuration({ enabled: true, port: 9876 }))
    await vi.waitFor(() => expect(stop).toHaveBeenCalledOnce())

    const close = controller.close()
    releaseStop()
    await Promise.all([update, close])

    expect(start).toHaveBeenCalledOnce()
    expect(stop).toHaveBeenCalledOnce()
  })

  it('propagates failed shutdown and retries the owned server', async () => {
    const onError = vi.fn()
    const stop = vi.fn()
      .mockRejectedValueOnce(new Error('transport busy'))
      .mockResolvedValue(undefined)
    const controller = createMcpServerController(notes, {
      onError,
      start: vi.fn(async () => stop),
    })

    await controller.update(configuration({ enabled: true }))
    await expect(controller.close()).rejects.toMatchObject({
      cause: expect.objectContaining({ message: 'transport busy' }),
      message: 'Failed to close active MCP server',
    })
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'transport busy' }))
    await controller.close()
    expect(stop).toHaveBeenCalledTimes(2)
  })

  it('rejects updates after close begins', async () => {
    const controller = createMcpServerController(notes)

    await controller.close()

    await expect(controller.update(configuration())).rejects.toBeInstanceOf(McpServerControllerClosedError)
  })
})
