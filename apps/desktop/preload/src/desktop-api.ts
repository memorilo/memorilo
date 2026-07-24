import type { DesktopApi, RuntimeInfo } from './contract'

export interface DesktopServices {
  app: {
    getRuntimeInfo: () => Promise<RuntimeInfo>
  }
}

export function createDesktopApi(services: DesktopServices): DesktopApi {
  return {
    getRuntimeInfo: () => services.app.getRuntimeInfo(),
  }
}
