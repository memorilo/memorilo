import type { NoteApplicationService } from '../notes/note-application-service'
import { describe, expect, it, vi } from 'vitest'
import { createMcpServerController } from './mcp-server-controller'

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
    await controller.update(configuration({ enabled: true, port: 9001 }))
    expect(start).toHaveBeenCalledTimes(1)
  })

  it('serializes rapid updates and recovers after a failed start', async () => {
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
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'occupied' }))
    expect(events).toEqual(['start:9000', 'start:9001'])

    await controller.close()
    expect(events).toEqual(['start:9000', 'start:9001', 'stop:9001'])
  })
})
