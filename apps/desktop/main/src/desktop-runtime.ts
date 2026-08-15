import type { ConfigurationStore } from '@memorilo/config'
import type { DesktopConfiguration } from '@memorilo/desktop-config'
import type { LearningPracticeConfiguration } from '@memorilo/editor-storage'
import type { MessageBoxOptions } from 'electron'
import { randomBytes } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { dirname, isAbsolute, join, resolve } from 'node:path'
import process from 'node:process'

import { createConfigurationStore } from '@memorilo/config'
import {
  desktopConfigurationChangedChannel,
  desktopConfigurationDefinition,
} from '@memorilo/desktop-config'
import {
  SqliteEditorStorage,
  SqliteShelfImageCache,
  SqliteShelfStorage,
} from '@memorilo/editor-storage'
import { createOperationSupervisor, createResourceScope } from '@memorilo/effect-lifecycle'
import { ShelfReadingFileStore } from '@memorilo/shelf/node'
import { app, BrowserWindow, dialog } from 'electron'

import { installApplicationMenu } from './application-menu'
import { registerAssetProtocol } from './asset-protocol'
import { createDesktopConfigurationAdapter } from './configuration/desktop-configuration-adapter'
import { createDesktopServices } from './ipc/services'
import { installJournalRollover } from './lifecycle/journal-rollover'
import { createMcpServerController } from './mcp/mcp-server-controller'
import { createNoteApplicationService } from './notes/note-application-service'
import { createActiveReadingRegistry } from './reading/active-reading-registry'
import { registerRendererProtocol } from './renderer-protocol'
import { BetterSqliteDatabase } from './storage/better-sqlite-database'
import { openCurrentMainDatabase } from './storage/main-database'
import { TransformersEmbeddingModel } from './storage/transformers-embedding-model'
import { WhiteboardLibraryApplication } from './whiteboard/whiteboard-library-application'
import { createSettingsWindowController } from './windows/settings-window'

export interface DesktopRuntime {
  close: () => Promise<void>
}

interface DesktopRuntimeOptions {
  allowTestClock: boolean
  createWindow: () => void
  mainDirectory: string
}

function databasePath(userDataPath: string): string {
  const configured = process.env.MEMORILO_DATABASE_PATH
  if (configured === undefined)
    return join(userDataPath, 'memorilo.sqlite')
  if (configured.length === 0)
    throw new TypeError('MEMORILO_DATABASE_PATH must not be empty')
  return configured
}

function assetDirectory(database: string): string | null {
  if (database === ':memory:')
    return null
  const absoluteDatabase = isAbsolute(database) ? database : resolve(database)
  return join(dirname(absoluteDatabase), 'assets')
}

function embeddingModelCacheDirectory(mainDirectory: string): string {
  if (app.isPackaged)
    return join(process.resourcesPath, 'embedding-models')
  return resolve(mainDirectory, '../../../../.cache/embedding-models')
}

function learningPracticeConfiguration(
  configuration: DesktopConfiguration,
): LearningPracticeConfiguration {
  return {
    dailyGoal: {
      fixedCards: configuration.goals.dailyLearningGoalCards,
      mode: configuration.goals.dailyLearningGoalMode,
    },
    queuePolicy: {
      buryInterdayLearningSiblings: configuration.flashcards.buryInterdayLearningSiblings,
      buryNewSiblings: configuration.flashcards.buryNewSiblings,
      buryReviewSiblings: configuration.flashcards.buryReviewSiblings,
      interdayOrder: configuration.flashcards.interdayOrder,
      learnAheadMinutes: configuration.flashcards.learnAheadMinutes,
      maxNewCardsPerDay: configuration.flashcards.newCardsPerDay,
      newGatherOrder: configuration.flashcards.newGatherOrder,
      reviewOrder: configuration.flashcards.reviewOrder,
      studyDayStartsAtHour: configuration.flashcards.studyDayStartsAtHour,
    },
  }
}

async function reportInvalidConfiguration(configurationPath: string, phase: 'reload' | 'startup'): Promise<void> {
  const consequence = phase === 'startup'
    ? 'Memorilo could not start.'
    : 'The changes were not applied. Memorilo will keep using the last valid settings.'
  console.error(`Invalid Memorilo configuration during ${phase}: ${configurationPath}`)
  const options: MessageBoxOptions = {
    buttons: ['OK'],
    defaultId: 0,
    detail: `One or more recognized settings have an invalid format. ${consequence}\n\nCheck the configuration file at:\n${configurationPath}`,
    message: 'Invalid Memorilo Configuration',
    noLink: true,
    type: 'error',
  }
  const owner = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
  if (owner)
    await dialog.showMessageBox(owner, options)
  else
    await dialog.showMessageBox(options)
}

async function createDesktopConfigurationStore(userDataPath: string): Promise<ConfigurationStore<DesktopConfiguration>> {
  const configurationPath = join(userDataPath, 'configuration.json')
  try {
    return await createConfigurationStore(
      desktopConfigurationDefinition,
      createDesktopConfigurationAdapter(userDataPath),
      {
        onError: () => void reportInvalidConfiguration(configurationPath, 'reload'),
      },
    )
  }
  catch {
    await reportInvalidConfiguration(configurationPath, 'startup')
    throw new Error(`Invalid Memorilo configuration: ${configurationPath}`)
  }
}

function shelfImageCacheDatabasePath(): string {
  const configured = process.env.MEMORILO_SHELF_IMAGE_CACHE_PATH
  if (configured !== undefined) {
    if (configured.length === 0)
      throw new TypeError('MEMORILO_SHELF_IMAGE_CACHE_PATH must not be empty')
    return configured
  }
  const homePath = app.getPath('home')
  const cacheDirectory = process.platform === 'darwin'
    ? join(homePath, 'Library', 'Caches', 'Memorilo')
    : process.platform === 'win32'
      ? join(process.env.LOCALAPPDATA || app.getPath('sessionData'), 'Memorilo', 'Cache')
      : join(process.env.XDG_CACHE_HOME || join(homePath, '.cache'), 'memorilo')
  mkdirSync(cacheDirectory, { recursive: true })
  return join(cacheDirectory, 'shelf-images.sqlite')
}

function shelfBookCacheDirectory(userDataPath: string): string {
  const configured = process.env.MEMORILO_SHELF_BOOK_CACHE_PATH
  if (configured !== undefined) {
    if (configured.length === 0)
      throw new TypeError('MEMORILO_SHELF_BOOK_CACHE_PATH must not be empty')
    return configured
  }
  if (process.env.MEMORILO_SHELF_IMAGE_CACHE_PATH === ':memory:')
    return join(userDataPath, 'shelf-book-cache')
  const homePath = app.getPath('home')
  return process.platform === 'darwin'
    ? join(homePath, 'Library', 'Caches', 'Memorilo', 'shelf-books')
    : process.platform === 'win32'
      ? join(process.env.LOCALAPPDATA || app.getPath('sessionData'), 'Memorilo', 'Cache', 'shelf-books')
      : join(process.env.XDG_CACHE_HOME || join(homePath, '.cache'), 'memorilo', 'shelf-books')
}

function shelfLibraryDirectory(databaseFilePath: string, userDataPath: string): string {
  if (databaseFilePath === ':memory:')
    return join(userDataPath, 'shelf')
  return join(dirname(resolve(databaseFilePath)), 'shelf')
}

function learningNow(allowTestClock: boolean): () => number {
  const configured = process.env.MEMORILO_E2E_NOW_MS
  if (configured === undefined)
    return Date.now
  if (!allowTestClock)
    throw new Error('MEMORILO_E2E_NOW_MS requires the E2E test clock capability')
  const milliseconds = Number(configured)
  if (!Number.isSafeInteger(milliseconds) || milliseconds < 0)
    throw new TypeError('MEMORILO_E2E_NOW_MS must be a non-negative safe integer')
  return () => milliseconds
}

export async function createDesktopRuntime(options: DesktopRuntimeOptions): Promise<DesktopRuntime> {
  // Every resource acquired after the shared database can depend on it during
  // a failed close retry. Do not release prerequisites past the first failure.
  const scope = createResourceScope('Application', { closeMode: 'dependent' })
  try {
    const userDataPath = app.getPath('userData')
    const database = databasePath(userDataPath)
    const assets = assetDirectory(database)
    await scope.acquire({
      acquire: () => registerAssetProtocol(assets),
      close: registration => registration.close(),
      name: 'asset protocol',
    })
    await scope.acquire({
      acquire: () => registerRendererProtocol(join(options.mainDirectory, '../renderer')),
      close: registration => registration.close(),
      name: 'renderer protocol',
    })
    const configuration = await scope.acquire({
      acquire: () => createDesktopConfigurationStore(userDataPath),
      close: store => store.close(),
      name: 'configuration store',
    })
    const configurationStore = configuration.resource
    const mainDatabase = (await scope.acquire({
      acquire: () => openCurrentMainDatabase(database),
      close: current => current.close(),
      name: 'main database',
    })).resource
    const mainDatabaseOperations = (await scope.acquire({
      acquire: () => createOperationSupervisor('Main database operations'),
      close: operations => operations.close(),
      name: 'main database operations',
    })).resource
    const editor = await scope.acquire({
      acquire: () => SqliteEditorStorage.open({
        database: mainDatabase,
        databaseOwnership: 'borrowed',
        embeddingModel: new TransformersEmbeddingModel({
          allowRemoteModels: !app.isPackaged && process.env.MEMORILO_EMBEDDING_MODEL_OFFLINE !== '1',
          cacheDirectory: embeddingModelCacheDirectory(options.mainDirectory),
        }),
        learningConfiguration: () => learningPracticeConfiguration(configurationStore.getSnapshot()),
        operationSupervisor: mainDatabaseOperations,
      }),
      close: storage => storage.close(),
      name: 'editor storage',
    })
    const editorStorage = editor.resource
    const whiteboardLibrary = (await scope.acquire({
      acquire: () => WhiteboardLibraryApplication.open(editorStorage.userDocuments),
      close: application => application.close(),
      name: 'Whiteboard Library',
    })).resource
    const shelfStorage = (await scope.acquire({
      acquire: () => SqliteShelfStorage.open({
        database: mainDatabase,
        databaseOwnership: 'borrowed',
        operationSupervisor: mainDatabaseOperations,
      }),
      close: storage => storage.close(),
      name: 'Shelf storage',
    })).resource
    const imageCacheDatabase = await scope.acquire({
      acquire: () => new BetterSqliteDatabase(shelfImageCacheDatabasePath(), {
        loadVectorExtension: false,
      }),
      close: current => current.close(),
      name: 'Shelf image cache database',
    })
    const shelfImageCache = (await scope.acquire({
      acquire: () => SqliteShelfImageCache.open({ database: imageCacheDatabase.resource }),
      close: cache => cache.close(),
      name: 'Shelf image cache',
    })).resource
    const shelfReadingFiles = (await scope.acquire({
      acquire: () => ShelfReadingFileStore.open({
        cacheDirectory: shelfBookCacheDirectory(userDataPath),
        libraryDirectory: shelfLibraryDirectory(database, userDataPath),
      }),
      close: files => files.close(),
      name: 'Shelf reading files',
    })).resource
    const activeReadings = (await scope.acquire({
      acquire: async () => createActiveReadingRegistry(),
      close: registry => registry.close(),
      name: 'active reading registry',
    })).resource

    let snapshot = configurationStore.getSnapshot()
    if (snapshot.mcp.accessToken.length < 32) {
      snapshot = await configurationStore.set({
        ...snapshot,
        mcp: { ...snapshot.mcp, accessToken: randomBytes(32).toString('base64url') },
      })
    }

    const assetOperations = (await scope.acquire({
      acquire: () => createOperationSupervisor('Asset operation queue'),
      close: operations => operations.close(),
      name: 'asset operations',
    })).resource
    const notes = (await scope.acquire({
      acquire: () => createNoteApplicationService(editorStorage, ({ noteId, update, updatedAt }) => {
        for (const window of BrowserWindow.getAllWindows())
          window.webContents.send('memorilo:note-update', { noteId, update, updatedAt })
      }, {
        defaultNoteLearningEnabled: () => configurationStore.getSnapshot().defaultNoteLearningEnabled,
      }, activeReadings),
      close: noteApplication => noteApplication.close(),
      name: 'Note application',
    })).resource
    await notes.openJournal()
    await scope.acquire({
      acquire: () => installJournalRollover(notes),
      close: rollover => rollover.close(),
      name: 'Journal rollover',
    })
    const mcpServer = (await scope.acquire({
      acquire: () => createMcpServerController(notes),
      close: server => server.close(),
      name: 'MCP server',
    })).resource
    await mcpServer.update(snapshot.mcp)
    await scope.acquire({
      acquire: () => createDesktopServices(
        notes,
        editorStorage,
        shelfStorage,
        shelfImageCache,
        shelfReadingFiles,
        configurationStore,
        assets,
        assetOperations.run,
        activeReadings,
        editorStorage.learning,
        whiteboardLibrary,
        learningNow(options.allowTestClock),
      ),
      close: handle => handle.close(),
      name: 'desktop IPC services',
    })
    await scope.acquire({
      acquire: () => configurationStore.subscribe(() => {
        const next = configurationStore.getSnapshot()
        for (const window of BrowserWindow.getAllWindows())
          window.webContents.send(desktopConfigurationChangedChannel, next)
        // The controller reports update failures; observe the rejection so a
        // failed hot reload cannot become an unhandled Promise.
        void mcpServer.update(next.mcp).then(undefined, () => undefined)
      }),
      close: unsubscribe => unsubscribe(),
      name: 'configuration subscription',
    })

    const settingsWindow = (await scope.acquire({
      acquire: () => createSettingsWindowController(options.mainDirectory),
      close: controller => controller.close(),
      name: 'settings window controller',
    })).resource
    await scope.acquire({
      acquire: () => installApplicationMenu(settingsWindow.show),
      close: remove => remove(),
      name: 'application menu',
    })
    options.createWindow()
    const handleActivate = (): void => {
      if (BrowserWindow.getAllWindows().length === 0)
        options.createWindow()
    }
    await scope.acquire({
      acquire: () => {
        app.on('activate', handleActivate)
        return () => {
          app.removeListener('activate', handleActivate)
        }
      },
      close: remove => remove(),
      name: 'application activation listener',
    })
    scope.commit()
    return { close: scope.close }
  }
  catch (error) {
    return scope.rollback(error)
  }
}
