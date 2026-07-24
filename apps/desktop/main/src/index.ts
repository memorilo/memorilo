import { join } from 'node:path'
import process from 'node:process'

import { app, BrowserWindow, shell } from 'electron'

import { services } from './ipc/services'

void services

function isAllowedNavigation(target: string, rendererUrl: string | undefined) {
  if (rendererUrl)
    return new URL(target).origin === new URL(rendererUrl).origin

  return new URL(target).protocol === 'file:'
}

function createWindow() {
  const rendererUrl = process.env.ELECTRON_RENDERER_URL
  const window = new BrowserWindow({
    height: 800,
    minHeight: 640,
    minWidth: 920,
    show: false,
    title: 'Memorilo',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: join(__dirname, '../preload/index.cjs'),
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
    void window.loadFile(join(__dirname, '../renderer/index.html'))
}

app.whenReady().then(() => {
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0)
      createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin')
    app.quit()
})
