import type { ConfigurationAdapter, ConfigurationStore } from '@memorilo/config'
import type { DesktopConfiguration } from '@memorilo/desktop-config'
import type { EditorStorage } from '@memorilo/editor-storage'
import type { MessageBoxOptions } from 'electron'
import { mkdirSync } from 'node:fs'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { createConfigurationStore } from '@memorilo/config'
import { createJsonFileConfigurationAdapter } from '@memorilo/config/node'
import {
  desktopConfigurationChangedChannel,
  desktopConfigurationDefinition,
  migrateDesktopConfiguration,
} from '@memorilo/desktop-config'
import { createEditorStorage, createShelfImageCache, createShelfStorage } from '@memorilo/editor-storage'
import { createShelfReadingFileStore } from '@memorilo/shelf/node'
import { app, BrowserWindow, dialog, net, protocol, shell } from 'electron'

import { installApplicationMenu } from './application-menu'
import { createDesktopServices } from './ipc/services'
import { BetterSqliteDatabase } from './storage/better-sqlite-database'
import { TransformersEmbeddingModel } from './storage/transformers-embedding-model'
import { createSettingsWindowController } from './windows/settings-window'

let editorStorage: EditorStorage | null = null
let shelfImageCacheDatabase: BetterSqliteDatabase | null = null
let configurationStore: ConfigurationStore<DesktopConfiguration> | null = null
let unsubscribeConfiguration: (() => void) | null = null
const mainDirectory = dirname(fileURLToPath(import.meta.url))
const productionRendererOrigin = 'memorilo://app'

app.setName('Memorilo')

protocol.registerSchemesAsPrivileged([{
  privileges: {
    corsEnabled: true,
    secure: true,
    standard: true,
    supportFetchAPI: true,
  },
  scheme: 'memorilo',
}])

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
  const cacheDirectory = process.platform === 'darwin'
    ? join(homePath, 'Library', 'Caches', 'Memorilo')
    : process.platform === 'win32'
      ? join(process.env.LOCALAPPDATA || app.getPath('sessionData'), 'Memorilo', 'Cache')
      : join(process.env.XDG_CACHE_HOME || join(homePath, '.cache'), 'memorilo')
  return join(cacheDirectory, 'shelf-books')
}

function shelfLibraryDirectory(databaseFilePath: string, userDataPath: string): string {
  if (databaseFilePath === ':memory:')
    return join(userDataPath, 'shelf')
  return join(dirname(resolve(databaseFilePath)), 'shelf')
}

function isAllowedNavigation(target: string, rendererUrl: string | undefined) {
  if (rendererUrl)
    return new URL(target).origin === new URL(rendererUrl).origin

  const targetUrl = new URL(target)
  return targetUrl.protocol === 'memorilo:' && targetUrl.hostname === 'app'
}

async function registerRendererProtocol() {
  const rendererDirectory = resolve(mainDirectory, '../renderer')
  await protocol.handle('memorilo', (request) => {
    const requestUrl = new URL(request.url)
    if (requestUrl.hostname !== 'app')
      return new Response('Not found', { status: 404 })

    const pathname = decodeURIComponent(requestUrl.pathname === '/' ? '/index.html' : requestUrl.pathname)
    const target = resolve(rendererDirectory, `.${pathname}`)
    const targetRelativePath = relative(rendererDirectory, target)
    if (targetRelativePath.startsWith('..') || isAbsolute(targetRelativePath))
      return new Response('Not found', { status: 404 })
    return net.fetch(pathToFileURL(target).toString())
  })
}

function createWindow() {
  const rendererUrl = process.env.ELECTRON_RENDERER_URL
  const macOSWindowOptions = process.platform === 'darwin'
    ? {
        backgroundColor: '#00000000',
        titleBarStyle: 'hiddenInset' as const,
        trafficLightPosition: { x: 20, y: 20 },
        vibrancy: 'under-window' as const,
        visualEffectState: 'active' as const,
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

  if (rendererUrl)
    void window.loadURL(rendererUrl)
  else
    void window.loadURL(`${productionRendererOrigin}/index.html`)
}

async function startApplication(): Promise<void> {
  if (!process.env.ELECTRON_RENDERER_URL)
    await registerRendererProtocol()
  const userDataPath = app.getPath('userData')
  configurationStore = await createDesktopConfigurationStore(userDataPath)
  const mainDatabasePath = databasePath(userDataPath)
  const database = new BetterSqliteDatabase(mainDatabasePath)
  editorStorage = await createEditorStorage({
    database,
    embeddingModel: new TransformersEmbeddingModel({
      allowRemoteModels: !app.isPackaged && process.env.MEMORILO_EMBEDDING_MODEL_OFFLINE !== '1',
      cacheDirectory: embeddingModelCacheDirectory(),
    }),
  })
  const shelfStorage = await createShelfStorage({ database })
  shelfImageCacheDatabase = new BetterSqliteDatabase(shelfImageCacheDatabasePath(), {
    loadVectorExtension: false,
  })
  const shelfImageCache = await createShelfImageCache({ database: shelfImageCacheDatabase })
  const shelfReadingFiles = await createShelfReadingFileStore({
    cacheDirectory: shelfBookCacheDirectory(userDataPath),
    libraryDirectory: shelfLibraryDirectory(mainDatabasePath, userDataPath),
  })
  createDesktopServices(editorStorage, shelfStorage, shelfImageCache, shelfReadingFiles, configurationStore)
  unsubscribeConfiguration = configurationStore.subscribe(() => {
    const configuration = configurationStore?.getSnapshot()
    if (!configuration)
      throw new Error('Desktop configuration store closed before broadcasting an update')
    for (const window of BrowserWindow.getAllWindows())
      window.webContents.send(desktopConfigurationChangedChannel, configuration)
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

app.on('will-quit', () => {
  unsubscribeConfiguration?.()
  unsubscribeConfiguration = null
  configurationStore?.close()
  configurationStore = null
  if (editorStorage !== null) {
    void editorStorage.close()
    editorStorage = null
  }
  if (shelfImageCacheDatabase !== null) {
    void shelfImageCacheDatabase.close()
    shelfImageCacheDatabase = null
  }
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin')
    app.quit()
})
