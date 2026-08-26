import type { BrowserWindow } from 'electron'
import { Buffer } from 'node:buffer'

import { Menu, nativeImage, Tray } from 'electron'

const trayIconSvg = `
<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
  <rect x="2" y="2" width="28" height="28" rx="7" fill="#4b5563"/>
  <path d="M9 22V10h3.2l3.8 5.1 3.8-5.1H23v12h-3v-7.1l-4 5.2-4-5.2V22H9Z" fill="#fff"/>
</svg>`

function createTrayIcon() {
  const icon = nativeImage.createFromDataURL(`data:image/svg+xml;base64,${Buffer.from(trayIconSvg).toString('base64')}`)
  return icon.resize({ height: 16, width: 16 })
}

export interface TrayController {
  close: () => void
}

export interface TrayControllerOptions {
  createWindow: () => void
  getWindow: () => BrowserWindow | undefined
  onQuit: () => void
}

export function createTrayController({ createWindow, getWindow, onQuit }: TrayControllerOptions): TrayController {
  const tray = new Tray(createTrayIcon())
  tray.setToolTip('Memorilo')

  const showWindow = (): void => {
    let window = getWindow()
    if (!window) {
      createWindow()
      window = getWindow()
    }
    if (!window)
      return
    if (window.isMinimized())
      window.restore()
    window.show()
    window.focus()
  }

  tray.setContextMenu(Menu.buildFromTemplate([
    { click: showWindow, label: 'Open Memorilo' },
    { type: 'separator' },
    { click: onQuit, label: 'Quit Memorilo' },
  ]))
  tray.on('click', showWindow)

  return {
    close: () => tray.destroy(),
  }
}
