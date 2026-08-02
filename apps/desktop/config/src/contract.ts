export const desktopConfigurationChangedChannel = 'memorilo:configuration-changed'

export type DesktopLanguage = 'en' | 'system' | 'zh-CN'
export type DesktopOutdentBehavior = 'logical' | 'traditional'

export interface DesktopMcpConfiguration {
  accessToken: string
  enabled: boolean
  port: number
}

export interface DesktopConfiguration {
  language: DesktopLanguage
  mcp: DesktopMcpConfiguration
  outdentBehavior: DesktopOutdentBehavior
  reduceMotion: boolean
}
