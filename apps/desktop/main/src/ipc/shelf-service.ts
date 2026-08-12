import type {
  AddShelfSourceInput,
  BrowseShelfInput,
  OpenShelfReadingInput,
  PrepareShelfReadingInput,
  ShelfAssetInput,
  ShelfImageCache,
  ShelfPublicationDetailsInput,
  ShelfReadingRangeInput,
  ShelfStorage,
  StoredShelfSource,
  UpdateShelfSourceInput,
} from '@memorilo/shelf'
import type { ShelfReadingFileStore } from '@memorilo/shelf/node'
import type { ActiveReadingRegistry } from '../reading/active-reading-registry'
import type { DesktopIpcHandlers } from './ipc-handler-registry'
import type { ShelfOperationRuntime } from './shelf-operation-runtime'
import { Buffer } from 'node:buffer'
import { randomUUID } from 'node:crypto'
import { fetchShelfAsset, fetchShelfPage, fetchShelfPublication } from '@memorilo/shelf'
import { BrowserWindow, dialog, safeStorage } from 'electron'
import { ShelfCatalogBrowser } from './shelf-catalog-browser'
import { ShelfReadingApplication } from './shelf-reading-application'
import { ShelfSourceApplication } from './shelf-source-application'

function credentialsForSource(source: StoredShelfSource) {
  if (source.auth === 'none')
    return undefined
  if (source.username === null || source.encryptedPassword === null)
    throw new Error(`Shelf source ${source.id} is missing its saved credentials`)
  if (!safeStorage.isEncryptionAvailable())
    throw new Error('Secure credential storage is unavailable on this device')
  return {
    password: safeStorage.decryptString(Buffer.from(source.encryptedPassword)),
    username: source.username,
  }
}

function encryptPassword(password: string): Uint8Array {
  if (!safeStorage.isEncryptionAvailable())
    throw new Error('Secure credential storage is unavailable on this device')
  return new Uint8Array(safeStorage.encryptString(password))
}

async function confirmReadingDeletion(): Promise<boolean> {
  const focusedWindow = BrowserWindow.getFocusedWindow()
  const options = {
    buttons: ['Cancel', 'Delete'],
    cancelId: 0,
    defaultId: 1,
    detail: 'The book can be downloaded again from its source.',
    message: 'Delete the local book file?',
    noLink: true,
    title: 'Delete Local File',
    type: 'warning' as const,
  }
  const confirmation = focusedWindow
    ? await dialog.showMessageBox(focusedWindow, options)
    : await dialog.showMessageBox(options)
  return confirmation.response === 1
}

/** Electron IPC adapter; application behavior lives in the two Shelf modules. */
export function createShelfHandlers(
  storage: ShelfStorage,
  imageCache: ShelfImageCache,
  readingFiles: ShelfReadingFileStore,
  activeReadings: ActiveReadingRegistry,
  operations: ShelfOperationRuntime,
): DesktopIpcHandlers['shelf'] {
  const credentials = { encrypt: encryptPassword, read: credentialsForSource }
  const sources = new ShelfSourceApplication({
    credentials,
    fetchPage: input => fetchShelfPage(input),
    imageCache,
    now: Date.now,
    operations,
    randomId: randomUUID,
    storage,
  })
  const catalog = new ShelfCatalogBrowser({
    credentials,
    fetchAsset: input => fetchShelfAsset(input),
    fetchPage: input => fetchShelfPage(input),
    imageCache,
    now: Date.now,
    operations,
    storage,
  })
  const readings = new ShelfReadingApplication({
    activeReadings,
    confirmDeletion: confirmReadingDeletion,
    credentialsForSource: credentials.read,
    fetchPublication: input => fetchShelfPublication(input),
    operations,
    readingFiles,
    storage,
  })

  return {
    addSource(input: AddShelfSourceInput) {
      return sources.add(input)
    },
    deleteReading(readingId: string) {
      return readings.delete(readingId)
    },
    getAsset(input: ShelfAssetInput) {
      return catalog.getAsset(input)
    },
    getCachedView(input: BrowseShelfInput) {
      return catalog.cachedView(input)
    },
    getPublicationDetails(input: ShelfPublicationDetailsInput) {
      return readings.details(input)
    },
    listSources() {
      return sources.list()
    },
    openReading(input: OpenShelfReadingInput) {
      return readings.open(input)
    },
    prepareReading(input: PrepareShelfReadingInput) {
      return readings.prepare(input)
    },
    readReadingRange(input: ShelfReadingRangeInput) {
      return readings.readRange(input)
    },
    refreshView(input: BrowseShelfInput) {
      return catalog.refreshView(input)
    },
    removeSource(sourceId: string) {
      return sources.remove(sourceId)
    },
    updateSource(input: UpdateShelfSourceInput) {
      return sources.update(input)
    },
  }
}
