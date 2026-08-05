export const desktopConfigurationChangedChannel = 'memorilo:configuration-changed'

export type DesktopLanguage = 'en' | 'system' | 'zh-CN'
export type DesktopOutdentBehavior = 'logical' | 'traditional'
export type DesktopNetworkImagePasteBehavior = 'download' | 'url'
export type DesktopTiffConversionFormat = 'avif' | 'jpeg' | 'png' | 'webp'
export type DesktopWeekStart = 'monday' | 'sunday'

export interface DesktopMcpConfiguration {
  accessToken: string
  enabled: boolean
  port: number
}

export interface DesktopConfiguration {
  language: DesktopLanguage
  mcp: DesktopMcpConfiguration
  networkImagePasteBehavior: DesktopNetworkImagePasteBehavior
  outdentBehavior: DesktopOutdentBehavior
  readerArrowKeyPageTurning: boolean
  reduceMotion: boolean
  tiffConversionFormat: DesktopTiffConversionFormat
  weekStart: DesktopWeekStart
}
