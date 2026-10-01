export type RendererPlatform = 'macos' | 'windows' | 'linux' | 'other'

export function getPlatform(): RendererPlatform {
  if (typeof window !== 'undefined' && typeof window.desktop !== 'undefined')
    return window.desktop.platform

  // Browser-only renderer tests and previews do not have the Electron bridge.
  // navigator.platform is only a fallback; Electron uses the native platform
  // value exposed by the preload bridge above.
  const platform = typeof navigator !== 'undefined' ? navigator.platform : ''
  if (/Mac|iPhone|iPad|iPod/i.test(platform))
    return 'macos'
  if (/Win/i.test(platform))
    return 'windows'
  if (/Linux/i.test(platform))
    return 'linux'
  return 'other'
}

export function isMacOS(): boolean {
  return getPlatform() === 'macos'
}
