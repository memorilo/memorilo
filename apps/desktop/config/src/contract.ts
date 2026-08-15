export const desktopConfigurationChangedChannel = 'memorilo:configuration-changed'

export type DesktopLanguage = 'en' | 'system' | 'zh-CN'
export type DesktopOutdentBehavior = 'logical' | 'traditional'
export type DesktopDailyGoalMode = 'all-due' | 'fixed' | 'spread-week'
export type DesktopNetworkImagePasteBehavior = 'download' | 'url'
export type DesktopReaderEpubPresentationMode = 'publisher' | 'reader'
export type DesktopReaderPageMode = 'continuous' | 'single-page'
export type DesktopReaderAnnotationCopyFormat = 'text' | 'text-book' | 'text-book-location'
export type DesktopTiffConversionFormat = 'avif' | 'jpeg' | 'png' | 'webp'
export type DesktopWeekStart = 'monday' | 'sunday'

export interface DesktopAnkiConfiguration {
  apiKey: string
  enabled: boolean
  host: string
  port: number
}

export interface DesktopBackupConfiguration {
  enabled: boolean
  intervalMinutes: number
  retentionCount: number
}

export interface DesktopFlashcardConfiguration {
  buryInterdayLearningSiblings: boolean
  buryNewSiblings: boolean
  buryReviewSiblings: boolean
  interdayOrder: 'after-reviews' | 'before-reviews' | 'mixed'
  learnAheadMinutes: number
  newCardsPerDay: number
  newGatherOrder: 'random' | 'source'
  reviewOrder: 'due-random' | 'retrievability'
  studyDayStartsAtHour: number
}

export interface DesktopGoalConfiguration {
  dailyLearningGoalCards: number
  dailyLearningGoalMode: DesktopDailyGoalMode
}

export interface DesktopMcpConfiguration {
  accessToken: string
  enabled: boolean
  port: number
}

export interface DesktopConfiguration {
  anki: DesktopAnkiConfiguration
  backup: DesktopBackupConfiguration
  flashcards: DesktopFlashcardConfiguration
  goals: DesktopGoalConfiguration
  language: DesktopLanguage
  mcp: DesktopMcpConfiguration
  networkImagePasteBehavior: DesktopNetworkImagePasteBehavior
  outdentBehavior: DesktopOutdentBehavior
  readerArrowKeyPageTurning: boolean
  readerAnnotationCopyFormat: DesktopReaderAnnotationCopyFormat
  readerEpubPresentationMode: DesktopReaderEpubPresentationMode
  readerPageMode: DesktopReaderPageMode
  reduceMotion: boolean
  tiffConversionFormat: DesktopTiffConversionFormat
  weekStart: DesktopWeekStart
}
