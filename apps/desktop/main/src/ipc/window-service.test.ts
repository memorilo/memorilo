import type { WebContents } from 'electron'
import { Buffer } from 'node:buffer'
import { describe, expect, it, vi } from 'vitest'
import { createWindowHandlers } from './window-service'

describe('window service Reader capture', () => {
  it('captures a validated region as PNG bytes', async () => {
    const toPNG = vi.fn(() => Buffer.from([137, 80, 78, 71]))
    const capturePage = vi.fn(async () => ({ toPNG }))
    const sender = { capturePage } as unknown as WebContents
    const handler = createWindowHandlers().captureReaderRegion

    await expect(handler.invoke(
      { sender },
      { height: 40, width: 60, x: 12, y: 8 },
    )).resolves.toEqual(Uint8Array.from([137, 80, 78, 71]))
    expect(capturePage).toHaveBeenCalledWith({ height: 40, width: 60, x: 12, y: 8 })
  })

  it('rejects invalid or empty captures', async () => {
    const sender = {
      capturePage: vi.fn(async () => ({ toPNG: () => Buffer.alloc(0) })),
    } as unknown as WebContents
    const handler = createWindowHandlers().captureReaderRegion

    await expect(handler.invoke(
      { sender },
      { height: 10, width: 0, x: 0, y: 0 },
    )).rejects.toThrow('dimensions must be positive')
    await expect(handler.invoke(
      { sender },
      { height: 10, width: 10, x: 0, y: 0 },
    )).rejects.toThrow('empty PNG')
  })
})
