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
export type DesktopRecurringTaskCompletionAction
  = | 'archive-completed-to-today'
    | 'move-next-to-today'
    | 'move-next-to-due-date'
    | 'nest-completed-under-next'
    | 'place-next-after-completed'
    | 'replace-completed'

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

export interface DesktopLearningConfiguration {
  enabled: boolean
}

export interface DesktopMcpConfiguration {
  accessToken: string
  enabled: boolean
  port: number
}

export interface DesktopTodoConfiguration {
  autoCompleteParentTasks: boolean
  enabled: boolean
  keepDetailOpenWhenTaskLeavesView: boolean
  recurringTaskCompletionAction: DesktopRecurringTaskCompletionAction
}

export interface DesktopConfiguration {
  anki: DesktopAnkiConfiguration
  backup: DesktopBackupConfiguration
  defaultNoteLearningEnabled: boolean
  flashcards: DesktopFlashcardConfiguration
  goals: DesktopGoalConfiguration
  learning: DesktopLearningConfiguration
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
  todo: DesktopTodoConfiguration
  weekStart: DesktopWeekStart
}
