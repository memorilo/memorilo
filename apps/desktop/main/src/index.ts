import type { MessageBoxOptions } from 'electron'
import type { DesktopRuntime } from './desktop-runtime'
import { dirname, join } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

import { app, BrowserWindow, dialog, ipcMain, protocol, shell } from 'electron'

import { assetProtocol } from './asset-protocol'
import { createDesktopRuntime } from './desktop-runtime'
import { flushRendererNotes } from './lifecycle/note-save-handshake'
import { createShutdownStateMachine } from './lifecycle/shutdown-state-machine'
import {
  isRendererUrl,
  rendererIndexUrl,
  rendererProtocol,
} from './renderer-protocol'
import { acquireSingleInstance, showPrimaryWindow } from './single-instance'

let desktopRuntime: DesktopRuntime | null = null
const mainDirectory = dirname(fileURLToPath(import.meta.url))

app.setName('Memorilo')
const isPrimaryInstance = acquireSingleInstance(app)
if (isPrimaryInstance) {
  app.on('second-instance', () => {
    const window = BrowserWindow.getAllWindows()[0]
    if (window)
      showPrimaryWindow(window)
  })
}
protocol.registerSchemesAsPrivileged([{
  scheme: assetProtocol,
  privileges: {
    secure: true,
    standard: true,
    supportFetchAPI: true,
  },
}, {
  scheme: rendererProtocol,
  privileges: {
    corsEnabled: true,
    secure: true,
    standard: true,
    supportFetchAPI: true,
  },
}])

const shutdown = createShutdownStateMachine({
  closeRuntime: async () => {
    await desktopRuntime?.close()
    desktopRuntime = null
  },
  getWindows: () => BrowserWindow.getAllWindows(),
  onError: (message, error) => console.error(message, error),
  quit: () => app.quit(),
  saveWindow: window => requestRendererSave([window.webContents], window),
})

function isAllowedNavigation(target: string, rendererUrl: string | undefined) {
  if (rendererUrl)
    return new URL(target).origin === new URL(rendererUrl).origin

  return isRendererUrl(target)
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
      backgroundThrottling: shouldShowWindow(),
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
    shutdown.handleWindowClose(window, event)
  })

  if (rendererUrl)
    void window.loadURL(rendererUrl)
  else
    void window.loadURL(rendererIndexUrl)
}

async function startApplication(): Promise<void> {
  desktopRuntime = await createDesktopRuntime({
    allowTestClock: process.env.MEMORILO_E2E_NOW_MS !== undefined,
    createWindow,
    mainDirectory,
  })
}

void app.whenReady()
  .then(async () => {
    if (isPrimaryInstance)
      await startApplication()
  })
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

app.on('before-quit', (event) => {
  shutdown.handleBeforeQuit(event)
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin')
    app.quit()
})
