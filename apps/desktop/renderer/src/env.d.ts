import type { DesktopApi } from '@memorilo/desktop-preload'

declare global {
  interface Window {
    desktop: DesktopApi
  }
}

export {}
