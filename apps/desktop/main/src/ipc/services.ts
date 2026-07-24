import type { MergeIpcService } from 'electron-ipc-decorator'
import { createServices } from 'electron-ipc-decorator'

import { AppService } from './app-service'

export const services = createServices([AppService] as const)
export type IpcServices = MergeIpcService<typeof services>
export type { RuntimeInfo } from './app-service'
