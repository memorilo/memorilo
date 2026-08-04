import type { DesktopApi, DesktopConfiguration, DesktopNoteExternalUpdate } from './contract'
import type { DesktopServices } from './desktop-api'
import type { NoteSaveRequest, NoteSaveResult } from './note-save-handshake'
import { desktopConfigurationChangedChannel } from '@memorilo/desktop-config/contract'
import { contextBridge, ipcRenderer } from 'electron'
import { createIpcProxy } from 'electron-ipc-decorator/client'

import { createDesktopApi } from './desktop-api'
import { noteSaveRequestChannel, noteSaveResultChannel } from './note-save-handshake'

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

const noteSaveListeners = new Set<Parameters<DesktopApi['subscribeNoteSaveRequests']>[0]>()
ipcRenderer.on(noteSaveRequestChannel, async (_event, request: NoteSaveRequest) => {
  let result: NoteSaveResult
  try {
    await Promise.all([...noteSaveListeners].map(listener => listener()))
    result = { requestId: request.requestId, status: 'saved' }
  }
  catch (error) {
    console.error('Failed to flush renderer Note updates before shutdown', error)
    result = {
      message: error instanceof Error ? error.message : String(error),
      requestId: request.requestId,
      status: 'failed',
    }
  }
  ipcRenderer.send(noteSaveResultChannel, result)
})

function subscribeNoteSaveRequests(listener: Parameters<DesktopApi['subscribeNoteSaveRequests']>[0]): () => void {
  noteSaveListeners.add(listener)
  return () => noteSaveListeners.delete(listener)
}

function subscribeNoteUpdates(listener: Parameters<DesktopApi['subscribeNoteUpdates']>[0]): () => void {
  const handleUpdate = (_event: Electron.IpcRendererEvent, update: DesktopNoteExternalUpdate) => {
    listener(update)
  }
  ipcRenderer.on('memorilo:note-update', handleUpdate)
  return () => ipcRenderer.removeListener('memorilo:note-update', handleUpdate)
}

contextBridge.exposeInMainWorld(
  'desktop',
  createDesktopApi(services, subscribeConfiguration, subscribeNoteSaveRequests, subscribeNoteUpdates),
)
