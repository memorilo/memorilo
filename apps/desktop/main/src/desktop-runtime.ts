import type { ConfigurationStore } from '@memorilo/config'
import type { DesktopConfiguration } from '@memorilo/desktop-config'
import type { LearningPracticeConfiguration } from '@memorilo/editor-storage'
import type { P2pApplication } from '@memorilo/p2p-sync/node'
import type { MessageBoxOptions } from 'electron'
import { Buffer } from 'node:buffer'
import { createHash, randomBytes } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { hostname } from 'node:os'
import { join, resolve } from 'node:path'
import process from 'node:process'

import { createConfigurationStore } from '@memorilo/config'
import { memoriloAppOrigin } from '@memorilo/desktop-api/transport'
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
import { JsonSyncJournal } from '@memorilo/p2p-sync'
import { createP2pApplication } from '@memorilo/p2p-sync/node'
import { ShelfReadingFileStore } from '@memorilo/shelf/node'

import { app, BrowserWindow, dialog } from 'electron'
import { installApplicationMenu } from './application-menu'
import { createDatabaseBackupApplication } from './backup/backup-application'
import { createDesktopConfigurationAdapter } from './configuration/desktop-configuration-adapter'
import { createDesktopServices } from './ipc/services'
import { installJournalRollover } from './lifecycle/journal-rollover'
import { createMcpServerController } from './mcp/mcp-server-controller'
import { createNoteApplicationService } from './notes/note-application-service'
import { createActiveReadingRegistry } from './reading/active-reading-registry'
import { BetterSqliteDatabase } from './storage/better-sqlite-database'
import { openCurrentMainDatabase } from './storage/main-database'
import { TransformersEmbeddingModel } from './storage/transformers-embedding-model'
import {
  assetDirectory,
  mainDatabasePath,
  shelfLibraryDirectory,
} from './storage/workspace-paths'
import { createTodoReminderScheduler } from './todo/todo-reminder-scheduler'
import { WhiteboardLibraryApplication } from './whiteboard/whiteboard-library-application'
import { createSettingsWindowController } from './windows/settings-window'

export interface DesktopRuntime {
  close: () => Promise<void>
}

interface DesktopRuntimeOptions {
  allowTestClock: boolean
  createWindow: () => void
  flushRenderer: () => Promise<boolean>
  mainDirectory: string
  requestRestart: () => void
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
    const database = mainDatabasePath(userDataPath)
    const assets = assetDirectory(database)
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
    await scope.acquire({
      acquire: () => createTodoReminderScheduler(editorStorage),
      close: scheduler => scheduler.close(),
      name: 'Todo reminder scheduler',
    })
    const whiteboardLibrary = (await scope.acquire({
      acquire: () => WhiteboardLibraryApplication.open(editorStorage.userDocuments),
      close: application => application.close(),
      name: 'Whiteboard Library',
    })).resource
    let p2pApplication: P2pApplication | null = null
    const syncJournal = new JsonSyncJournal(join(userDataPath, 'p2p', 'sync-journal.json'))
    await syncJournal.load()
    const pendingJournalWrites = new Set<Promise<void>>()
    const pendingLocalNoteUpdates: Array<{ noteId: string, update: Uint8Array }> = []
    let journalError: unknown = null
    let applyingRemoteP2pChanges = 0
    const queueJournalWrite = (write: Promise<void>): void => {
      const tracked = write.catch((error) => {
        journalError = error
      })
      pendingJournalWrites.add(tracked)
      void tracked.then(() => pendingJournalWrites.delete(tracked))
    }
    const queueLocalNoteUpdate = (noteId: string, update: Uint8Array): void => {
      const application = p2pApplication
      if (application === null) {
        pendingLocalNoteUpdates.push({ noteId, update: new Uint8Array(update) })
        return
      }
      const deviceId = application.pairing.identity.deviceId
      const updateId = createHash('sha256')
        .update(noteId)
        .update('\0')
        .update(update)
        .digest('hex')
      const payload = JSON.stringify({ noteId, update: Buffer.from(update).toString('base64url') })
      const write = syncJournal.appendLocal({
        id: `${deviceId}:note:${updateId}`,
        kind: 'note-update',
        payload,
      }).then(() => undefined)
      queueJournalWrite(write)
      void write.then(
        () => application.notifyChangesAvailable(),
      ).catch(error => console.warn(`Failed to synchronize local Note ${noteId}`, error))
    }
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
        if (applyingRemoteP2pChanges === 0)
          queueLocalNoteUpdate(noteId, update)
        for (const window of BrowserWindow.getAllWindows())
          window.webContents.send('memorilo:note-update', { noteId, update, updatedAt })
      }, {
        autoCompleteTodoParents: () => configurationStore.getSnapshot().todo.autoCompleteParentTasks,
        defaultNoteLearningEnabled: () => configurationStore.getSnapshot().defaultNoteLearningEnabled,
        recurringTaskCompletionAction: () => configurationStore.getSnapshot().todo.recurringTaskCompletionAction,
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
    const p2p = (await scope.acquire({
      acquire: () => createP2pApplication({
        deviceName: process.env.MEMORILO_DEVICE_NAME ?? hostname(),
        onStatus: (status) => {
          for (const window of BrowserWindow.getAllWindows())
            window.webContents.send('memorilo:p2p-status', status)
        },
        statePath: join(userDataPath, 'p2p', 'identity.json'),
        provider: {
          applyChanges: async (changes, _peer) => {
            applyingRemoteP2pChanges += 1
            let learningChanged = false
            try {
              for (const change of changes) {
                if (change.kind === 'learning-mutation') {
                  const learningChange = JSON.parse(change.payload) as {
                    createdAt: number
                    entityId: string
                    entityKind: 'assignment' | 'card' | 'optimizer' | 'review-event' | 'tombstone'
                    mutationId: string
                    operation: 'delete' | 'upsert'
                    payload: unknown
                  }
                  await editorStorage.learning.sync.applyRemote({
                    ...learningChange,
                    sourceDeviceId: change.deviceId,
                    sourceSequence: change.sequence,
                  })
                  learningChanged = true
                  continue
                }
                if (change.kind !== 'note-update')
                  continue
                const payload = JSON.parse(change.payload) as { noteId: string, update: string }
                await notes.saveNoteUpdates({ noteId: payload.noteId, updates: [Uint8Array.from(Buffer.from(payload.update, 'base64url'))] })
              }
              const acceptedNewChanges = await syncJournal.recordReceivedAndReport(changes)
              if (learningChanged) {
                for (const window of BrowserWindow.getAllWindows())
                  window.webContents.send('memorilo:learning-update')
              }
              if (acceptedNewChanges) {
                queueMicrotask(() => {
                  void p2pApplication?.notifyChangesAvailable().catch(error => console.warn('Failed to relay P2P changes', error))
                })
              }
            }
            finally {
              applyingRemoteP2pChanges -= 1
            }
          },
          observeMembershipEpoch: async (epoch) => {
            await p2pApplication?.observeMembershipEpoch(epoch)
          },
          getChanges: async (since) => {
            await Promise.all([...pendingJournalWrites])
            if (journalError !== null)
              throw journalError
            const learningChanges = await editorStorage.learning.sync.listPending(250)
            for (const change of learningChanges) {
              const write = syncJournal.appendLocal({
                id: change.mutationId,
                kind: 'learning-mutation',
                payload: JSON.stringify(change),
              })
              await write
            }
            return syncJournal.listChanges(since)
          },
          acknowledgeChanges: async (changeIds) => {
            const localDeviceId = p2pApplication?.pairing.identity.deviceId
            const learningIds = new Set(syncJournal.listChanges({})
              .filter(change => change.kind === 'learning-mutation'
                && change.deviceId === localDeviceId
                && changeIds.includes(change.id))
              .map(change => change.id))
            if (learningIds.size > 0)
              await editorStorage.learning.sync.acknowledgeMutations([...learningIds])
            if ((await editorStorage.learning.sync.listPending(1)).length > 0) {
              queueMicrotask(() => {
                void p2pApplication?.notifyChangesAvailable().catch(error => console.warn('Failed to continue Learning synchronization', error))
              })
            }
          },
          getMembershipEpoch: () => p2pApplication?.membershipEpoch() ?? 1,
          getVersionVector: () => syncJournal.getVersionVector(),
        },
      }),
      close: application => application.close(),
      name: 'P2P sync',
    })).resource
    p2pApplication = p2p
    await syncJournal.setDeviceId(p2pApplication.pairing.identity.deviceId)
    pendingLocalNoteUpdates.splice(0).forEach(({ noteId, update }) => queueLocalNoteUpdate(noteId, update))
    await mcpServer.update(snapshot.mcp)
    const backup = (await scope.acquire({
      acquire: () => createDatabaseBackupApplication({
        assetDirectory: assets,
        configuration: configurationStore,
        database: mainDatabase,
        databasePath: database,
        flushRenderer: options.flushRenderer,
        requestRestart: options.requestRestart,
        shelfDirectory: shelfLibraryDirectory(database, userDataPath),
      }),
      close: application => application.close(),
      name: 'database backup',
    })).resource
    await scope.acquire({
      acquire: () => createDesktopServices(
        notes,
        editorStorage,
        backup,
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
        {
          allowedOrigins: new Set([
            memoriloAppOrigin,
            ...(process.env.ELECTRON_RENDERER_URL === undefined
              ? []
              : [new URL(process.env.ELECTRON_RENDERER_URL).origin]),
          ]),
          rendererDirectory: join(options.mainDirectory, '../renderer'),
        },
        p2p,
      ),
      close: handle => handle.close(),
      name: 'desktop services',
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
