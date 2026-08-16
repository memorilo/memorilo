import type { ConfigurationStore } from '@memorilo/config'
import type {
  DesktopExportDatabaseResult,
  DesktopRestoreDatabaseResult,
} from '@memorilo/desktop-api'
import type { DesktopConfiguration } from '@memorilo/desktop-config'
import type { BrowserWindow } from 'electron'
import type { BetterSqliteDatabase } from '../storage/better-sqlite-database'
import { mkdir } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { createOperationSupervisor } from '@memorilo/effect-lifecycle'

import { app, dialog } from 'electron'
import { automaticBackupDirectory, workspaceDirectory } from '../storage/workspace-paths'
import { createAutomaticDatabaseBackup } from './database-backup'
import { exportDatabase } from './database-export'
import {
  stageDatabaseRestore,
  stageExportRestore,
} from './restore-state'

export interface DatabaseBackupApplication {
  close: () => Promise<void>
  exportDatabase: (owner: BrowserWindow | null) => Promise<DesktopExportDatabaseResult | { status: 'cancelled' }>
  restoreDatabase: (owner: BrowserWindow | null) => Promise<DesktopRestoreDatabaseResult>
}

export interface DatabaseBackupApplicationOptions {
  appVersion?: string
  assetDirectory: string | null
  configuration: ConfigurationStore<DesktopConfiguration>
  database: BetterSqliteDatabase
  databasePath: string
  flushRenderer: () => Promise<boolean>
  requestRestart: () => void
  shelfDirectory: string
}

function isExportPath(path: string): boolean {
  return path.toLowerCase().endsWith('.tar.zst')
}

function exportFileName(): string {
  return `Memorilo-${new Date().toISOString().replace(/[-:]/gu, '').replace(/\.\d{3}/u, '')}.tar.zst`
}

function withExportExtension(path: string): string {
  return isExportPath(path) ? path : `${path}.tar.zst`
}

function showSaveDialog(owner: BrowserWindow | null, options: Electron.SaveDialogOptions): Promise<Electron.SaveDialogReturnValue> {
  return owner ? dialog.showSaveDialog(owner, options) : dialog.showSaveDialog(options)
}

function showOpenDialog(owner: BrowserWindow | null, options: Electron.OpenDialogOptions): Promise<Electron.OpenDialogReturnValue> {
  return owner ? dialog.showOpenDialog(owner, options) : dialog.showOpenDialog(options)
}

function showMessageBox(owner: BrowserWindow | null, options: Electron.MessageBoxOptions): Promise<Electron.MessageBoxReturnValue> {
  return owner ? dialog.showMessageBox(owner, options) : dialog.showMessageBox(options)
}

export function createDatabaseBackupApplication(
  options: DatabaseBackupApplicationOptions,
): DatabaseBackupApplication {
  const operations = createOperationSupervisor('Database backup')
  const appVersion = options.appVersion ?? app.getVersion()
  let timer: ReturnType<typeof setTimeout> | null = null
  let closed = false

  const schedule = (): void => {
    if (timer !== null) {
      clearTimeout(timer)
      timer = null
    }
    if (closed || options.assetDirectory === null || !options.configuration.getSnapshot().backup.enabled)
      return
    const interval = options.configuration.getSnapshot().backup.intervalMinutes * 60_000
    timer = setTimeout(() => {
      timer = null
      void operations.run(async () => {
        const directory = automaticBackupDirectory(options.databasePath)
        if (directory === null)
          return
        await createAutomaticDatabaseBackup(
          options.database,
          directory,
          options.configuration.getSnapshot().backup.retentionCount,
        )
      }).then(
        () => schedule(),
        (error) => {
          console.error('Automatic database backup failed', error)
          schedule()
        },
      )
    }, interval)
  }

  const unsubscribe = options.configuration.subscribe(schedule)
  schedule()

  const exportDatabaseForUser = async (
    owner: BrowserWindow | null,
  ): Promise<DesktopExportDatabaseResult | { status: 'cancelled' }> => {
    if (options.assetDirectory === null)
      throw new Error('Database export is unavailable for an in-memory database')
    const workspace = workspaceDirectory(options.databasePath)
    if (workspace === null)
      throw new Error('Database export workspace is unavailable')
    const selected = await showSaveDialog(owner, {
      defaultPath: join(workspace, exportFileName()),
      filters: [{ extensions: ['tar.zst'], name: 'Memorilo database export' }],
      title: 'Export Database',
    })
    if (selected.canceled || selected.filePath.length === 0)
      return { status: 'cancelled' }
    if (!await options.flushRenderer())
      return { status: 'cancelled' }
    const destinationPath = withExportExtension(selected.filePath)
    const assetDirectory = options.assetDirectory
    if (assetDirectory === null)
      throw new Error('Database export is unavailable for an in-memory database')
    await operations.run(async () => {
      await exportDatabase({
        appVersion,
        assetDirectory,
        database: options.database,
        destinationPath,
        shelfDirectory: options.shelfDirectory,
      })
    })
    return { path: destinationPath }
  }

  const restoreDatabaseForUser = async (
    owner: BrowserWindow | null,
  ): Promise<DesktopRestoreDatabaseResult> => {
    if (options.assetDirectory === null)
      throw new Error('Database restore is unavailable for an in-memory database')
    const selected = await showOpenDialog(owner, {
      filters: [
        { extensions: ['sqlite', 'db'], name: 'SQLite database' },
        { extensions: ['tar.zst'], name: 'Memorilo database export' },
      ],
      properties: ['openFile'],
      title: 'Restore Database',
    })
    if (selected.canceled || selected.filePaths.length === 0)
      return { status: 'cancelled' }
    const sourcePath = selected.filePaths[0]
    if (!sourcePath)
      throw new Error('Restore dialog returned no database path')
    const confirmation = await showMessageBox(owner, {
      buttons: ['Cancel', 'Restore and Restart'],
      cancelId: 0,
      defaultId: 0,
      detail: `The current database will be replaced with:\n${basename(sourcePath)}\n\nMemorilo will restart after preparing the restore.`,
      message: 'Restore Database?',
      noLink: true,
      type: 'warning',
    })
    if (confirmation.response !== 1)
      return { status: 'cancelled' }
    if (!await options.flushRenderer())
      return { status: 'cancelled' }

    await operations.run(async () => {
      const backupDirectory = automaticBackupDirectory(options.databasePath)
      if (backupDirectory === null)
        throw new Error('Database restore safety backup is unavailable for an in-memory database')
      await mkdir(backupDirectory, { recursive: true })
      await createAutomaticDatabaseBackup(
        options.database,
        backupDirectory,
        options.configuration.getSnapshot().backup.retentionCount,
      )
      if (isExportPath(sourcePath))
        await stageExportRestore(sourcePath, options.databasePath)
      else
        await stageDatabaseRestore(sourcePath, options.databasePath)
    })
    setTimeout(() => options.requestRestart(), 0)
    return { status: 'restarting' }
  }

  return {
    close: async () => {
      if (closed)
        return
      closed = true
      if (timer !== null) {
        clearTimeout(timer)
        timer = null
      }
      unsubscribe()
      await operations.close()
    },
    exportDatabase: exportDatabaseForUser,
    restoreDatabase: restoreDatabaseForUser,
  }
}
