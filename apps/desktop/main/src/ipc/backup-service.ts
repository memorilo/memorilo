import type { DatabaseBackupApplication } from '../backup/backup-application'
import type { DesktopRequestHandlers } from '../desktop-request-handlers'
import { BrowserWindow } from 'electron'
import { withDesktopRequestContext } from '../desktop-request-handlers'

export function createBackupHandlers(
  application: DatabaseBackupApplication,
): DesktopRequestHandlers['backup'] {
  return {
    exportDatabase: withDesktopRequestContext(context => (
      application.exportDatabase(BrowserWindow.fromWebContents(context.sender))
    )),
    restoreDatabase: withDesktopRequestContext(context => (
      application.restoreDatabase(BrowserWindow.fromWebContents(context.sender))
    )),
  }
}
