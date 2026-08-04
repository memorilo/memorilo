import type { BrowserWindowConstructorOptions } from 'electron'
import { join } from 'node:path'
import process from 'node:process'
import { BrowserWindow } from 'electron'

export interface SettingsWindowController {
  show: () => void
}

export function createSettingsWindowController(mainDirectory: string): SettingsWindowController {
  let settingsWindow: BrowserWindow | null = null

  const show = () => {
    if (settingsWindow && !settingsWindow.isDestroyed()) {
      if (settingsWindow.isMinimized())
        settingsWindow.restore()
      settingsWindow.show()
      settingsWindow.focus()
      return
    }

    const macOSOptions: BrowserWindowConstructorOptions = process.platform === 'darwin'
      ? {
          vibrancy: 'under-window',
          visualEffectState: 'followWindow',
        }
      : {}
    settingsWindow = new BrowserWindow({
      backgroundColor: process.platform === 'darwin' ? '#00f4f5f7' : '#f4f5f7',
      fullscreenable: false,
      height: 520,
      maximizable: false,
      minimizable: false,
      minHeight: 360,
      resizable: true,
      show: false,
      title: 'Memorilo Settings',
      width: 540,
      ...macOSOptions,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        preload: join(mainDirectory, '../preload/index.cjs'),
        sandbox: true,
      },
    })

    settingsWindow.once('ready-to-show', () => settingsWindow?.show())
    settingsWindow.on('closed', () => {
      settingsWindow = null
    })
    settingsWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))

    const rendererUrl = process.env.ELECTRON_RENDERER_URL
    if (rendererUrl) {
      const baseUrl = rendererUrl.endsWith('/') ? rendererUrl : `${rendererUrl}/`
      void settingsWindow.loadURL(new URL('settings.html', baseUrl).toString())
    }
    else {
      void settingsWindow.loadFile(join(mainDirectory, '../renderer/settings.html'))
    }
  }

  return { show }
}
