import { afterEach, describe, expect, it, vi } from 'vitest'
import { getPlatform, isMacOS } from './platform'

afterEach(() => vi.unstubAllGlobals())

describe('renderer platform', () => {
  it.each([
    ['windows', 'MacIntel', false],
    ['linux', 'MacIntel', false],
    ['macos', 'Win32', true],
    ['other', 'MacIntel', false],
  ])('uses the %s bridge platform even when navigator.platform disagrees', (platform, navigatorPlatform, expected) => {
    vi.stubGlobal('window', { desktop: { platform } })
    vi.stubGlobal('navigator', { platform: navigatorPlatform })

    expect(getPlatform()).toBe(platform)
    expect(isMacOS()).toBe(expected)
  })

  it('supports browser previews without the Electron bridge', () => {
    vi.stubGlobal('window', {})
    vi.stubGlobal('navigator', { platform: 'MacIntel' })

    expect(getPlatform()).toBe('macos')
    expect(isMacOS()).toBe(true)
  })

  it('supports a non-browser test environment', () => {
    vi.stubGlobal('window', undefined)
    vi.stubGlobal('navigator', undefined)

    expect(isMacOS()).toBe(false)
  })
})
