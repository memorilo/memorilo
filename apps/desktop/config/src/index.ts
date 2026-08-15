import { defineConfiguration } from '@memorilo/config'
import * as Schema from 'effect/Schema'

export type {
  DesktopAnkiConfiguration,
  DesktopBackupConfiguration,
  DesktopConfiguration,
  DesktopDailyGoalMode,
  DesktopFlashcardConfiguration,
  DesktopGoalConfiguration,
  DesktopLanguage,
  DesktopMcpConfiguration,
  DesktopNetworkImagePasteBehavior,
  DesktopOutdentBehavior,
  DesktopReaderAnnotationCopyFormat,
  DesktopReaderEpubPresentationMode,
  DesktopReaderPageMode,
  DesktopTiffConversionFormat,
  DesktopWeekStart,
} from './contract'
export { desktopConfigurationChangedChannel } from './contract'

export const defaultDesktopOutdentBehavior = 'logical' as const

const defaultFlashcardConfiguration = {
  buryInterdayLearningSiblings: true,
  buryNewSiblings: true,
  buryReviewSiblings: true,
  interdayOrder: 'before-reviews',
  learnAheadMinutes: 20,
  newCardsPerDay: 20,
  newGatherOrder: 'source',
  reviewOrder: 'due-random',
  studyDayStartsAtHour: 4,
} as const

const defaultGoalConfiguration = {
  dailyLearningGoalCards: 30,
  dailyLearningGoalMode: 'spread-week',
} as const

export const DesktopConfigurationSchema = Schema.Struct({
  anki: Schema.Struct({
    apiKey: Schema.String,
    enabled: Schema.Boolean,
    host: Schema.NonEmptyString.check(Schema.isPattern(/^[^\s/?#]+$/u)),
    port: Schema.Int.check(Schema.isBetween({ maximum: 65535, minimum: 1 })),
  }),
  backup: Schema.Struct({
    enabled: Schema.Boolean,
    intervalMinutes: Schema.Int.check(Schema.isBetween({ maximum: 10_080, minimum: 1 })),
    retentionCount: Schema.Int.check(Schema.isBetween({ maximum: 100, minimum: 1 })),
  }),
  flashcards: Schema.Struct({
    buryInterdayLearningSiblings: Schema.Boolean,
    buryNewSiblings: Schema.Boolean,
    buryReviewSiblings: Schema.Boolean,
    interdayOrder: Schema.Literals(['after-reviews', 'before-reviews', 'mixed']),
    learnAheadMinutes: Schema.Int.check(Schema.isBetween({ maximum: 1_440, minimum: 0 })),
    newCardsPerDay: Schema.Int.check(Schema.isBetween({ maximum: 100_000, minimum: 0 })),
    newGatherOrder: Schema.Literals(['random', 'source']),
    reviewOrder: Schema.Literals(['due-random', 'retrievability']),
    studyDayStartsAtHour: Schema.Int.check(Schema.isBetween({ maximum: 23, minimum: 0 })),
  }),
  goals: Schema.Struct({
    dailyLearningGoalCards: Schema.Int.check(Schema.isBetween({ maximum: 100_000, minimum: 1 })),
    dailyLearningGoalMode: Schema.Literals(['all-due', 'fixed', 'spread-week']),
  }),
  language: Schema.Literals(['system', 'en', 'zh-CN']),
  mcp: Schema.Struct({
    accessToken: Schema.String,
    enabled: Schema.Boolean,
    port: Schema.Int.check(Schema.isBetween({ maximum: 65535, minimum: 1024 })),
  }),
  networkImagePasteBehavior: Schema.Literals(['download', 'url']),
  outdentBehavior: Schema.Literals(['logical', 'traditional']),
  readerArrowKeyPageTurning: Schema.Boolean,
  readerAnnotationCopyFormat: Schema.Literals(['text', 'text-book', 'text-book-location']),
  readerEpubPresentationMode: Schema.Literals(['publisher', 'reader']),
  readerPageMode: Schema.Literals(['continuous', 'single-page']),
  reduceMotion: Schema.Boolean,
  tiffConversionFormat: Schema.Literals(['avif', 'jpeg', 'png', 'webp']),
  weekStart: Schema.Literals(['monday', 'sunday']),
}).check(Schema.makeFilter(configuration => configuration.mcp.enabled && configuration.mcp.accessToken.length < 32
  ? { message: 'MCP requires an access token containing at least 32 characters', path: ['mcp', 'accessToken'] }
  : undefined))

export const desktopConfigurationDefinition = defineConfiguration({
  defaults: {
    anki: {
      apiKey: '',
      enabled: false,
      host: '127.0.0.1',
      port: 8765,
    },
    backup: {
      enabled: false,
      intervalMinutes: 1_440,
      retentionCount: 7,
    },
    flashcards: defaultFlashcardConfiguration,
    goals: defaultGoalConfiguration,
    language: 'system' as const,
    mcp: {
      accessToken: '',
      enabled: false,
      port: 8765,
    },
    networkImagePasteBehavior: 'download' as const,
    outdentBehavior: defaultDesktopOutdentBehavior,
    readerArrowKeyPageTurning: true,
    readerAnnotationCopyFormat: 'text' as const,
    readerEpubPresentationMode: 'publisher' as const,
    readerPageMode: 'continuous' as const,
    reduceMotion: false,
    tiffConversionFormat: 'webp' as const,
    weekStart: 'sunday' as const,
  },
  id: 'memorilo-desktop',
  schema: DesktopConfigurationSchema,
  sections: [{
    fields: [
      {
        control: 'select',
        label: 'Language',
        options: [
          { label: 'System Default', value: 'system' },
          { label: 'English', value: 'en' },
          { label: '简体中文', value: 'zh-CN' },
        ],
        path: 'language',
      },
      {
        control: 'segmented',
        description: 'Choose the first day shown in calendars.',
        label: 'First day of week',
        options: [
          { label: 'Sunday', value: 'sunday' },
          { label: 'Monday', value: 'monday' },
        ],
        path: 'weekStart',
      },
      {
        control: 'toggle',
        label: 'Reduce motion',
        path: 'reduceMotion',
      },
    ],
    id: 'general',
    label: 'General',
  }, {
    fields: [{
      control: 'toggle',
      description: 'Periodically create a SQLite snapshot beside the main database.',
      label: 'Enable automatic backups',
      path: 'backup.enabled',
    }, {
      control: 'number',
      description: 'Create a new snapshot after this many minutes while Memorilo is running.',
      label: 'Backup interval',
      max: 10_080,
      min: 1,
      path: 'backup.intervalMinutes',
      step: 1,
      unit: 'minutes',
    }, {
      control: 'number',
      description: 'Older automatic snapshots are removed after this limit is reached.',
      label: 'Backups to keep',
      max: 100,
      min: 1,
      path: 'backup.retentionCount',
      step: 1,
      unit: 'backups',
    }],
    id: 'backup',
    label: 'Backup',
  }, {
    fields: [{
      control: 'toggle',
      description: 'Show Anki decks in Learning and use Anki\'s reviewer through AnkiConnect.',
      label: 'Enable AnkiConnect',
      path: 'anki.enabled',
    }, {
      control: 'text',
      description: 'IP address or host name where AnkiConnect is listening.',
      label: 'AnkiConnect host',
      path: 'anki.host',
      placeholder: '127.0.0.1',
    }, {
      control: 'number',
      description: 'AnkiConnect listens on port 8765 by default.',
      label: 'AnkiConnect port',
      max: 65535,
      min: 1,
      path: 'anki.port',
      step: 1,
    }, {
      control: 'text',
      description: 'Optional API key configured in the AnkiConnect add-on. Keep it private.',
      label: 'AnkiConnect API key',
      path: 'anki.apiKey',
      sensitive: true,
    }],
    id: 'anki',
    label: 'Anki',
  }, {
    fields: [{
      control: 'number',
      description: 'Limit how many never-practiced cards enter the learning flow each study day.',
      label: 'New cards per day',
      max: 100_000,
      min: 0,
      path: 'flashcards.newCardsPerDay',
      step: 1,
      unit: 'cards',
    }, {
      control: 'select',
      label: 'New card gather order',
      options: [
        { label: 'Source order', value: 'source' },
        { label: 'Random', value: 'random' },
      ],
      path: 'flashcards.newGatherOrder',
    }, {
      control: 'select',
      label: 'Interday learning order',
      options: [
        { label: 'Before reviews', value: 'before-reviews' },
        { label: 'Mixed with reviews', value: 'mixed' },
        { label: 'After reviews', value: 'after-reviews' },
      ],
      path: 'flashcards.interdayOrder',
    }, {
      control: 'select',
      label: 'Review order',
      options: [
        { label: 'Due date, then random', value: 'due-random' },
        { label: 'Lowest retrievability first', value: 'retrievability' },
      ],
      path: 'flashcards.reviewOrder',
    }, {
      control: 'number',
      label: 'Learn-ahead limit',
      max: 1_440,
      min: 0,
      path: 'flashcards.learnAheadMinutes',
      step: 1,
      unit: 'minutes',
    }, {
      control: 'number',
      label: 'Next day starts at',
      max: 23,
      min: 0,
      path: 'flashcards.studyDayStartsAtHour',
      step: 1,
      unit: 'hour',
    }, {
      control: 'toggle',
      label: 'Bury new siblings',
      path: 'flashcards.buryNewSiblings',
    }, {
      control: 'toggle',
      label: 'Bury review siblings',
      path: 'flashcards.buryReviewSiblings',
    }, {
      control: 'toggle',
      label: 'Bury interday learning siblings',
      path: 'flashcards.buryInterdayLearningSiblings',
    }],
    id: 'flashcards',
    label: 'Flashcards',
  }, {
    fields: [{
      control: 'select',
      label: 'Daily learning goal',
      options: [
        { label: 'Spread over the week', value: 'spread-week' },
        { label: 'Review all due cards each day', value: 'all-due' },
        { label: 'Set a daily limit', value: 'fixed' },
      ],
      path: 'goals.dailyLearningGoalMode',
    }, {
      control: 'number',
      description: 'Used when the Daily Goal is set to a daily limit.',
      label: 'Daily limit',
      max: 100_000,
      min: 1,
      path: 'goals.dailyLearningGoalCards',
      step: 1,
      unit: 'cards',
    }],
    id: 'goals',
    label: 'Goals & Streaks',
  }, {
    fields: [{
      control: 'select',
      description: 'Choose how Shift-Tab moves selected blocks in Outline mode.',
      label: 'Outdent behavior',
      options: [
        { label: 'Logical', value: 'logical' },
        { label: 'Traditional', value: 'traditional' },
      ],
      path: 'outdentBehavior',
    }, {
      control: 'select',
      description: 'Download remote image links into managed assets when pasting, or keep their original URLs.',
      label: 'Pasted network images',
      options: [
        { label: 'Download into Assets', value: 'download' },
        { label: 'Keep URL', value: 'url' },
      ],
      path: 'networkImagePasteBehavior',
    }],
    id: 'editor',
    label: 'Editor',
  }, {
    fields: [
      {
        control: 'segmented',
        description: 'Choose continuous vertical reading or one page at a time.',
        label: 'Page mode',
        options: [
          { label: 'Continuous', value: 'continuous' },
          { label: 'Single page', value: 'single-page' },
        ],
        path: 'readerPageMode',
      },
      {
        control: 'select',
        description: 'Choose the default layout mode for reflowable EPUB books.',
        label: 'EPUB layout mode',
        options: [
          { label: 'Publisher', value: 'publisher' },
          { label: 'Reader', value: 'reader' },
        ],
        path: 'readerEpubPresentationMode',
      },
      {
        control: 'select',
        description: 'Choose what is included when copying highlighted text.',
        label: 'Highlight copy format',
        options: [
          { label: 'Text only', value: 'text' },
          { label: 'Text and book title', value: 'text-book' },
          { label: 'Text, book title, and location', value: 'text-book-location' },
        ],
        path: 'readerAnnotationCopyFormat',
      },
      {
        control: 'toggle',
        description: 'Use the left and right arrow keys to turn pages while reading.',
        label: 'Arrow keys turn pages',
        path: 'readerArrowKeyPageTurning',
      },
    ],
    id: 'reading',
    label: 'Reading',
  }, {
    fields: [{
      control: 'select',
      description: 'TIFF images are converted to a browser-compatible format before being stored.',
      label: 'TIFF conversion format',
      options: [
        { label: 'WebP', value: 'webp' },
        { label: 'PNG', value: 'png' },
        { label: 'JPEG', value: 'jpeg' },
        { label: 'AVIF', value: 'avif' },
      ],
      path: 'tiffConversionFormat',
    }],
    id: 'images',
    label: 'Images',
  }, {
    fields: [{
      control: 'toggle',
      description: 'Expose Memorilo through a local MCP server for external AI tools.',
      label: 'Enable MCP server',
      path: 'mcp.enabled',
    }, {
      control: 'number',
      description: 'Clients connect to http://127.0.0.1:<port>/mcp.',
      label: 'MCP port',
      max: 65535,
      min: 1024,
      path: 'mcp.port',
      step: 1,
    }, {
      control: 'text',
      description: 'Bearer token required by MCP clients. Keep it private.',
      label: 'MCP access token',
      path: 'mcp.accessToken',
      sensitive: true,
    }],
    id: 'mcp',
    label: 'MCP',
  }],
})

export function migrateDesktopConfiguration(configuration: unknown): unknown {
  if (typeof configuration !== 'object' || configuration === null || Array.isArray(configuration))
    return configuration
  const current = configuration as Record<string, unknown>
  const hasAnki = typeof current.anki === 'object'
    && current.anki !== null
    && !Array.isArray(current.anki)
  const anki = hasAnki ? current.anki as Record<string, unknown> : {}
  const ankiApiKey = typeof anki.apiKey === 'string' ? anki.apiKey : ''
  const ankiEnabled = anki.enabled === true
  const ankiHost = typeof anki.host === 'string' && /^[^\s/?#]+$/u.test(anki.host)
    ? anki.host
    : '127.0.0.1'
  const ankiPort = typeof anki.port === 'number'
    && Number.isSafeInteger(anki.port)
    && anki.port >= 1
    && anki.port <= 65535
    ? anki.port
    : 8765
  const hasFlashcards = typeof current.flashcards === 'object'
    && current.flashcards !== null
    && !Array.isArray(current.flashcards)
  const hasGoals = typeof current.goals === 'object'
    && current.goals !== null
    && !Array.isArray(current.goals)
  const hasMcp = typeof current.mcp === 'object' && current.mcp !== null && !Array.isArray(current.mcp)
  const hasBackup = typeof current.backup === 'object'
    && current.backup !== null
    && !Array.isArray(current.backup)
  const backup = hasBackup ? current.backup as Record<string, unknown> : {}
  const backupEnabled = backup.enabled === true
  const backupIntervalMinutes = typeof backup.intervalMinutes === 'number'
    && Number.isSafeInteger(backup.intervalMinutes)
    && backup.intervalMinutes >= 1
    && backup.intervalMinutes <= 10_080
    ? backup.intervalMinutes
    : 1_440
  const backupRetentionCount = typeof backup.retentionCount === 'number'
    && Number.isSafeInteger(backup.retentionCount)
    && backup.retentionCount >= 1
    && backup.retentionCount <= 100
    ? backup.retentionCount
    : 7
  const mcp = hasMcp ? current.mcp as Record<string, unknown> : {}
  const accessToken = typeof mcp.accessToken === 'string' ? mcp.accessToken : ''
  const port = typeof mcp.port === 'number'
    && Number.isSafeInteger(mcp.port)
    && mcp.port >= 1024
    && mcp.port <= 65535
    ? mcp.port
    : 8765
  const enabled = mcp.enabled === true && accessToken.length >= 32
  const networkImagePasteBehavior = current.networkImagePasteBehavior === undefined
    ? 'download'
    : current.networkImagePasteBehavior
  const readerArrowKeyPageTurning = current.readerArrowKeyPageTurning === undefined
    ? true
    : current.readerArrowKeyPageTurning
  const readerAnnotationCopyFormat = current.readerAnnotationCopyFormat === undefined
    ? 'text'
    : current.readerAnnotationCopyFormat
  const readerEpubPresentationMode = current.readerEpubPresentationMode === undefined
    ? 'publisher'
    : current.readerEpubPresentationMode
  const readerPageMode = current.readerPageMode === undefined
    ? 'continuous'
    : current.readerPageMode
  const tiffConversionFormat = current.tiffConversionFormat === undefined
    ? 'webp'
    : current.tiffConversionFormat
  if (hasAnki
    && hasBackup
    && hasMcp
    && hasFlashcards
    && hasGoals
    && anki.apiKey === ankiApiKey
    && anki.enabled === ankiEnabled
    && anki.host === ankiHost
    && anki.port === ankiPort
    && backup.enabled === backupEnabled
    && backup.intervalMinutes === backupIntervalMinutes
    && backup.retentionCount === backupRetentionCount
    && mcp.accessToken === accessToken
    && mcp.enabled === enabled
    && mcp.port === port
    && current.networkImagePasteBehavior !== undefined
    && current.outdentBehavior !== undefined
    && current.readerArrowKeyPageTurning !== undefined
    && current.readerAnnotationCopyFormat !== undefined
    && current.readerEpubPresentationMode !== undefined
    && current.readerPageMode !== undefined
    && current.tiffConversionFormat !== undefined
    && current.weekStart !== undefined) {
    return configuration
  }
  return {
    ...current,
    anki: {
      apiKey: ankiApiKey,
      enabled: ankiEnabled,
      host: ankiHost,
      port: ankiPort,
    },
    backup: {
      enabled: backupEnabled,
      intervalMinutes: backupIntervalMinutes,
      retentionCount: backupRetentionCount,
    },
    flashcards: hasFlashcards ? current.flashcards : defaultFlashcardConfiguration,
    goals: hasGoals ? current.goals : defaultGoalConfiguration,
    mcp: {
      accessToken,
      enabled,
      port,
    },
    networkImagePasteBehavior,
    outdentBehavior: current.outdentBehavior ?? defaultDesktopOutdentBehavior,
    readerArrowKeyPageTurning,
    readerAnnotationCopyFormat,
    readerEpubPresentationMode,
    readerPageMode,
    tiffConversionFormat,
    weekStart: current.weekStart ?? 'sunday',
  }
}
