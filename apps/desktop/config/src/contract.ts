export const desktopConfigurationChangedChannel = 'memorilo:configuration-changed'

export type DesktopLanguage = 'en' | 'system' | 'zh-CN'
export type DesktopOutdentBehavior = 'logical' | 'traditional'

export interface DesktopConfiguration {
  language: DesktopLanguage
  outdentBehavior: DesktopOutdentBehavior
  readerArrowKeyPageTurning: boolean
  reduceMotion: boolean
}
