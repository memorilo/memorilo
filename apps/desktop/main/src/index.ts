import type { ConfigurationAdapter, ConfigurationStore } from '@memorilo/config'
import type { DesktopConfiguration } from '@memorilo/desktop-config'
import type { EditorStorage } from '@memorilo/editor-storage'
import type { MessageBoxOptions } from 'electron'
import { randomBytes } from 'node:crypto'
import { dirname, join, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

import { createConfigurationStore } from '@memorilo/config'
import { createJsonFileConfigurationAdapter } from '@memorilo/config/node'
import {
  desktopConfigurationChangedChannel,
  desktopConfigurationDefinition,
  migrateDesktopConfiguration,
} from '@memorilo/desktop-config'
import { createEditorStorage } from '@memorilo/editor-storage'
import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'

import { installApplicationMenu } from './application-menu'
import { createDesktopServices } from './ipc/services'
import { flushRendererNotes } from './lifecycle/note-save-handshake'
import { createMcpServerController } from './mcp/mcp-server-controller'
import { createNoteApplicationService } from './notes/note-application-service'
import { BetterSqliteDatabase } from './storage/better-sqlite-database'
import { TransformersEmbeddingModel } from './storage/transformers-embedding-model'
import { createSettingsWindowController } from './windows/settings-window'

let editorStorage: EditorStorage | null = null
let configurationStore: ConfigurationStore<DesktopConfiguration> | null = null
let unsubscribeConfiguration: (() => void) | null = null
let closeMcpServer: (() => Promise<void>) | null = null
let closeNoteApplication: (() => Promise<void>) | null = null
let shutdownPromise: Promise<boolean> | null = null
let shutdownComplete = false
let quitting = false
const windowsReadyToClose = new WeakSet<BrowserWindow>()
const mainDirectory = dirname(fileURLToPath(import.meta.url))

app.setName('Memorilo')

function databasePath(userDataPath: string): string {
  const configured = process.env.MEMORILO_DATABASE_PATH
  if (configured === undefined)
    return join(userDataPath, 'memorilo.sqlite')
  if (configured.length === 0)
    throw new TypeError('MEMORILO_DATABASE_PATH must not be empty')
  return configured
}

function embeddingModelCacheDirectory(): string {
  if (app.isPackaged)
    return join(process.resourcesPath, 'embedding-models')
  return resolve(mainDirectory, '../../../../.cache/embedding-models')
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

function desktopConfigurationAdapter(userDataPath: string): ConfigurationAdapter {
  const adapter = createJsonFileConfigurationAdapter(join(userDataPath, 'configuration.json'))
  return {
    read: async () => {
      const stored = await adapter.read()
      if (stored === null)
        return null
      const migrated = migrateDesktopConfiguration(stored)
      if (migrated !== stored)
        await adapter.write(migrated)
      return migrated
    },
    subscribe: adapter.subscribe,
    write: adapter.write,
  }
}

async function createDesktopConfigurationStore(userDataPath: string): Promise<ConfigurationStore<DesktopConfiguration>> {
  const configurationPath = join(userDataPath, 'configuration.json')
  try {
    return await createConfigurationStore(
      desktopConfigurationDefinition,
      desktopConfigurationAdapter(userDataPath),
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

function isAllowedNavigation(target: string, rendererUrl: string | undefined) {
  if (rendererUrl)
    return new URL(target).origin === new URL(rendererUrl).origin

  return new URL(target).protocol === 'file:'
}

function shouldShowWindow(): boolean {
  return process.env.MEMORILO_E2E_HIDE_WINDOW !== '1'
}

function createWindow() {
  const rendererUrl = process.env.ELECTRON_RENDERER_URL
  const macOSWindowOptions = process.platform === 'darwin'
    ? {
        titleBarStyle: 'hiddenInset' as const,
        trafficLightPosition: { x: 20, y: 20 },
      }
    : {}
  const window = new BrowserWindow({
    backgroundColor: '#ffffff',
    height: 800,
    minHeight: 640,
    minWidth: 720,
    show: false,
    title: 'Memorilo',
    ...macOSWindowOptions,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: join(mainDirectory, '../preload/index.cjs'),
      sandbox: true,
    },
    width: 1200,
  })

  if (shouldShowWindow())
    window.once('ready-to-show', () => window.show())
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://'))
      void shell.openExternal(url)
    return { action: 'deny' }
  })
  window.webContents.on('will-navigate', (event, url) => {
    if (!isAllowedNavigation(url, rendererUrl))
      event.preventDefault()
  })
  window.on('close', (event) => {
    if (quitting || windowsReadyToClose.has(window) || window.webContents.isDestroyed())
      return
    event.preventDefault()
    window.setEnabled(false)
    void requestRendererSave([window.webContents], window).then((saved) => {
      if (!saved) {
        window.setEnabled(true)
        return
      }
      windowsReadyToClose.add(window)
      window.close()
    })
  })

  if (rendererUrl)
    void window.loadURL(rendererUrl)
  else
    void window.loadFile(join(mainDirectory, '../renderer/index.html'))
}

async function startApplication(): Promise<void> {
  const userDataPath = app.getPath('userData')
  configurationStore = await createDesktopConfigurationStore(userDataPath)
  editorStorage = await createEditorStorage({
    database: new BetterSqliteDatabase(databasePath(userDataPath)),
    embeddingModel: new TransformersEmbeddingModel({
      allowRemoteModels: !app.isPackaged && process.env.MEMORILO_EMBEDDING_MODEL_OFFLINE !== '1',
      cacheDirectory: embeddingModelCacheDirectory(),
    }),
  })
  let configuration = configurationStore.getSnapshot()
  if (configuration.mcp.accessToken.length < 32) {
    configuration = await configurationStore.set({
      ...configuration,
      mcp: { ...configuration.mcp, accessToken: randomBytes(32).toString('base64url') },
    })
  }

  const notes = createNoteApplicationService(editorStorage, ({ noteId, update, updatedAt }) => {
    for (const window of BrowserWindow.getAllWindows())
      window.webContents.send('memorilo:note-update', { noteId, update, updatedAt })
  })
  const mcpServer = createMcpServerController(notes)
  closeMcpServer = mcpServer.close
  closeNoteApplication = notes.close

  createDesktopServices(notes, editorStorage.learning, configurationStore)
  void mcpServer.update(configuration.mcp)
  unsubscribeConfiguration = configurationStore.subscribe(() => {
    const next = configurationStore?.getSnapshot()
    if (!next)
      throw new Error('Desktop configuration store closed before broadcasting an update')
    for (const window of BrowserWindow.getAllWindows())
      window.webContents.send(desktopConfigurationChangedChannel, next)
    void mcpServer.update(next.mcp)
  })
  const settingsWindow = createSettingsWindowController(mainDirectory)
  installApplicationMenu(settingsWindow.show)
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0)
      createWindow()
  })
}

void app.whenReady()
  .then(startApplication)
  .catch((error) => {
    console.error('Failed to start Memorilo', error)
    app.quit()
  })

async function requestRendererSave(
  targets = BrowserWindow.getAllWindows().map(window => window.webContents),
  owner = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0],
): Promise<boolean> {
  while (true) {
    const outcome = await flushRendererNotes({ ipcMain, targets })
    if (outcome.status === 'saved')
      return true
    const detail = outcome.status === 'failed'
      ? `Memorilo could not save the latest Note changes.\n\n${outcome.message}`
      : 'Memorilo did not receive a save confirmation before the timeout.'
    const options: MessageBoxOptions = {
      buttons: ['Retry', 'Cancel'],
      cancelId: 1,
      defaultId: 0,
      detail: `${detail}\n\nRetry saving, or cancel closing to keep your changes open.`,
      message: 'Note Changes Are Not Saved',
      noLink: true,
      type: 'warning',
    }
    const response = owner
      ? await dialog.showMessageBox(owner, options)
      : await dialog.showMessageBox(options)
    if (response.response !== 0)
      return false
  }
}

async function shutdownApplication(): Promise<boolean> {
  if (!await requestRendererSave())
    return false

  unsubscribeConfiguration?.()
  unsubscribeConfiguration = null
  configurationStore?.close()
  configurationStore = null

  const stopMcp = closeMcpServer
  closeMcpServer = null
  await stopMcp?.()

  const closeNotes = closeNoteApplication
  closeNoteApplication = null
  await closeNotes?.()

  const storage = editorStorage
  editorStorage = null
  await storage?.close()
  return true
}

app.on('before-quit', (event) => {
  if (shutdownComplete)
    return
  event.preventDefault()
  if (shutdownPromise)
    return
  const windows = BrowserWindow.getAllWindows()
  windows.forEach(window => window.setEnabled(false))
  shutdownPromise = shutdownApplication()
    .catch((error) => {
      console.error('Failed to shut down Memorilo cleanly', error)
      return false
    })
    .then((closed) => {
      if (!closed) {
        windows.forEach((window) => {
          if (!window.isDestroyed())
            window.setEnabled(true)
        })
        return false
      }
      shutdownComplete = true
      quitting = true
      app.quit()
      return true
    })
    .finally(() => {
      shutdownPromise = null
    })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin')
    app.quit()
})
