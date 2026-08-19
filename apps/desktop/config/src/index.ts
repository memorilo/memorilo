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
  DesktopLearningConfiguration,
  DesktopMcpConfiguration,
  DesktopNetworkImagePasteBehavior,
  DesktopOutdentBehavior,
  DesktopReaderAnnotationCopyFormat,
  DesktopReaderEpubPresentationMode,
  DesktopReaderPageMode,
  DesktopRecurringTaskCompletionAction,
  DesktopTiffConversionFormat,
  DesktopTodoConfiguration,
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
  defaultNoteLearningEnabled: Schema.Boolean,
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
  learning: Schema.Struct({
    enabled: Schema.Boolean,
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
  todo: Schema.Struct({
    autoCompleteParentTasks: Schema.Boolean,
    enabled: Schema.Boolean,
    keepDetailOpenWhenTaskLeavesView: Schema.Boolean,
    recurringTaskCompletionAction: Schema.Literals([
      'archive-completed-to-today',
      'move-next-to-today',
      'move-next-to-due-date',
      'nest-completed-under-next',
      'place-next-after-completed',
      'replace-completed',
    ]),
  }),
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
    defaultNoteLearningEnabled: true,
    flashcards: defaultFlashcardConfiguration,
    goals: defaultGoalConfiguration,
    learning: {
      enabled: true,
    },
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
    todo: {
      autoCompleteParentTasks: true,
      enabled: true,
      keepDetailOpenWhenTaskLeavesView: true,
      recurringTaskCompletionAction: 'archive-completed-to-today' as const,
    },
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
      {
        control: 'toggle',
        label: 'Enable learning for new Notes',
        path: 'defaultNoteLearningEnabled',
      },
    ],
    id: 'general',
    label: 'General',
  }, {
    fields: [{
      control: 'toggle',
      description: 'Complete a Todo parent when all of its direct Todo children are complete, and reopen it when one is reopened.',
      label: 'Auto-complete parent Todos',
      path: 'todo.autoCompleteParentTasks',
    }, {
      control: 'toggle',
      description: 'Show the Todo workspace without changing Todo blocks inside the editor.',
      label: 'Enable Todo workspace',
      path: 'todo.enabled',
    }, {
      control: 'toggle',
      description: 'Keep the selected task open when a change removes it from the current Todo view.',
      label: 'Keep task details open',
      path: 'todo.keepDetailOpenWhenTaskLeavesView',
    }, {
      control: 'select',
      description: 'Choose where the completed occurrence and the next task are placed.',
      label: 'After completing a recurring task',
      options: [
        { label: 'Archive in today\'s Journal', value: 'archive-completed-to-today' },
        { label: 'Next to today\'s Journal', value: 'move-next-to-today' },
        { label: 'Next to due-date Journal', value: 'move-next-to-due-date' },
        { label: 'Completion under next', value: 'nest-completed-under-next' },
        { label: 'Next after completion', value: 'place-next-after-completed' },
        { label: 'Replace with next', value: 'replace-completed' },
      ],
      path: 'todo.recurringTaskCompletionAction',
    }],
    id: 'todo',
    label: 'Todo',
  }, {
    fields: [{
      control: 'toggle',
      description: 'Enable flashcards, cloze authoring, FSRS scheduling, learning pages, and image occlusion.',
      label: 'Enable learning features',
      path: 'learning.enabled',
    }],
    id: 'learning',
    label: 'Learning',
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
        description: 'Choose original book formatting or optimized reading layout for reflowable EPUB books.',
        label: 'EPUB layout preference',
        options: [
          { label: 'Original formatting', value: 'publisher' },
          { label: 'Optimized reading', value: 'reader' },
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
  const record = configuration as Record<string, unknown>
  if (!Object.hasOwn(record, 'todo')) {
    return {
      ...record,
      todo: desktopConfigurationDefinition.defaults.todo,
    }
  }
  const todo = record.todo
  if (typeof todo === 'object'
    && todo !== null
    && !Array.isArray(todo)
    && !Object.hasOwn(todo, 'recurringTaskCompletionAction')) {
    return {
      ...record,
      todo: {
        ...todo,
        autoCompleteParentTasks: desktopConfigurationDefinition.defaults.todo.autoCompleteParentTasks,
        recurringTaskCompletionAction: desktopConfigurationDefinition.defaults.todo.recurringTaskCompletionAction,
      },
    }
  }
  if (typeof todo === 'object'
    && todo !== null
    && !Array.isArray(todo)
    && !Object.hasOwn(todo, 'autoCompleteParentTasks')) {
    return {
      ...record,
      todo: {
        ...todo,
        autoCompleteParentTasks: desktopConfigurationDefinition.defaults.todo.autoCompleteParentTasks,
      },
    }
  }
  return record
}
