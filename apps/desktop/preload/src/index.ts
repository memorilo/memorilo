import type { DesktopServices } from './desktop-api'
import { contextBridge, ipcRenderer } from 'electron'

import { createIpcProxy } from 'electron-ipc-decorator/client'
import { createDesktopApi } from './desktop-api'

const services = createIpcProxy<DesktopServices>(ipcRenderer)

if (!services)
  throw new Error('Failed to create the desktop IPC proxy')

contextBridge.exposeInMainWorld('desktop', createDesktopApi(services))
