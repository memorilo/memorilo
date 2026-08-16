import type { AppRouteHandlers } from '@memorilo/desktop-api'
import process from 'node:process'

export function createAppHandlers(): AppRouteHandlers {
  return {
    getRuntimeInfo() {
      return {
        platform: process.platform,
        version: process.versions.electron,
      }
    },
  }
}
