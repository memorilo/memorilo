import type { DesktopApi, DesktopConfiguration, DesktopNoteExternalUpdate } from './contract'
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

function subscribeNoteUpdates(listener: Parameters<DesktopApi['subscribeNoteUpdates']>[0]): () => void {
  const handleUpdate = (_event: Electron.IpcRendererEvent, update: DesktopNoteExternalUpdate) => {
    listener(update)
  }
  ipcRenderer.on('memorilo:note-update', handleUpdate)
  return () => ipcRenderer.removeListener('memorilo:note-update', handleUpdate)
}

contextBridge.exposeInMainWorld('desktop', createDesktopApi(services, subscribeConfiguration, subscribeNoteUpdates))
