import type { DatabaseBackupApplication } from '../backup/backup-application'
import type { DesktopIpcHandlers } from './ipc-handler-registry'
import { BrowserWindow } from 'electron'
import { withIpcContext } from './ipc-handler-registry'

export function createBackupHandlers(
  application: DatabaseBackupApplication,
): DesktopIpcHandlers['backup'] {
  return {
    exportDatabase: withIpcContext(context => (
      application.exportDatabase(BrowserWindow.fromWebContents(context.sender))
    )),
    restoreDatabase: withIpcContext(context => (
      application.restoreDatabase(BrowserWindow.fromWebContents(context.sender))
    )),
  }
}
