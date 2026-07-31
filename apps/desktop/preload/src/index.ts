import type { DesktopConfiguration } from './contract'
import type { DesktopServices } from './desktop-api'
import { desktopConfigurationChangedChannel } from '@memorilo/desktop-config/contract'
import { contextBridge, ipcRenderer } from 'electron'

import { createIpcProxy } from 'electron-ipc-decorator/client'
import { createDesktopApi } from './desktop-api'

const services = createIpcProxy<DesktopServices>(ipcRenderer)

if (!services)
  throw new Error('Failed to create the desktop IPC proxy')

function subscribeConfiguration(listener: (configuration: DesktopConfiguration) => void): () => void {
  const handleChange = (_event: Electron.IpcRendererEvent, configuration: DesktopConfiguration) => {
    listener(configuration)
  }
  ipcRenderer.on(desktopConfigurationChangedChannel, handleChange)
  return () => ipcRenderer.removeListener(desktopConfigurationChangedChannel, handleChange)
}

contextBridge.exposeInMainWorld('desktop', createDesktopApi(services, subscribeConfiguration))
