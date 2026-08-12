import type { DesktopIpcHandlers } from './ipc-handler-registry'
import process from 'node:process'

export interface RuntimeInfo {
  platform: NodeJS.Platform
  version: string
}

export function createAppHandlers(): DesktopIpcHandlers['app'] {
  return {
    getRuntimeInfo(): RuntimeInfo {
      return {
        platform: process.platform,
        version: process.versions.electron,
      }
    },
  }
}
