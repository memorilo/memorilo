export interface RuntimeInfo {
  platform: string
  version: string
}

export interface DesktopApi {
  getRuntimeInfo: () => Promise<RuntimeInfo>
}
