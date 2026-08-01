import type { EditorStorage } from '@memorilo/editor-storage'
import { mkdirSync } from 'node:fs'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { createEditorStorage, createShelfImageCache, createShelfStorage } from '@memorilo/editor-storage'
import { app, BrowserWindow, net, protocol, shell } from 'electron'

import { createDesktopServices } from './ipc/services'
import { BetterSqliteDatabase } from './storage/better-sqlite-database'
import { TransformersEmbeddingModel } from './storage/transformers-embedding-model'

let editorStorage: EditorStorage | null = null
let shelfImageCacheDatabase: BetterSqliteDatabase | null = null
const mainDirectory = dirname(fileURLToPath(import.meta.url))
const productionRendererOrigin = 'memorilo://app'

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
  const database = new BetterSqliteDatabase(databasePath(userDataPath))
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
  createDesktopServices(editorStorage, shelfStorage, shelfImageCache)
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
