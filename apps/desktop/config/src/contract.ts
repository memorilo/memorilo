export const desktopConfigurationChangedChannel = 'memorilo:configuration-changed'

export type DesktopLanguage = 'en' | 'system' | 'zh-CN'
export type DesktopOutdentBehavior = 'logical' | 'traditional'
export type DesktopDailyGoalMode = 'all-due' | 'fixed' | 'spread-week'
export type DesktopNetworkImagePasteBehavior = 'download' | 'url'
export type DesktopReaderEpubPresentationMode = 'publisher' | 'reader'
export type DesktopTiffConversionFormat = 'avif' | 'jpeg' | 'png' | 'webp'
export type DesktopWeekStart = 'monday' | 'sunday'

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
  flashcards: DesktopFlashcardConfiguration
  goals: DesktopGoalConfiguration
  language: DesktopLanguage
  mcp: DesktopMcpConfiguration
  networkImagePasteBehavior: DesktopNetworkImagePasteBehavior
  outdentBehavior: DesktopOutdentBehavior
  readerArrowKeyPageTurning: boolean
  readerEpubPresentationMode: DesktopReaderEpubPresentationMode
  reduceMotion: boolean
  tiffConversionFormat: DesktopTiffConversionFormat
  weekStart: DesktopWeekStart
}
