import { describe, expect, it, vi } from 'vitest'

import { createDesktopApi } from './desktop-api'

describe('createDesktopApi', () => {
  it('exposes a narrow runtime information bridge', async () => {
    const runtimeInfo = { platform: 'win32' as const, version: '43.2.0' }
    const getRuntimeInfo = vi.fn().mockResolvedValue(runtimeInfo)
    const api = createDesktopApi({ app: { getRuntimeInfo } })

    await expect(api.getRuntimeInfo()).resolves.toEqual(runtimeInfo)
    expect(Object.keys(api)).toEqual(['getRuntimeInfo'])
    expect(getRuntimeInfo).toHaveBeenCalledOnce()
  })
})
