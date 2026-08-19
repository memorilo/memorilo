import { Directory, File, Paths } from 'expo-file-system'
import * as SecureStore from 'expo-secure-store'
import { mobileDatabaseName, mobileShelfImageCacheDatabaseName } from '@/database/mobile-database'

interface StorageGroupStatistics {
  byteSize: number
  fileCount: number
}

export interface MobileStorageSnapshot {
  assets: StorageGroupStatistics
  availableDiskBytes: number
  databaseBytes: number
  generatedExports: StorageGroupStatistics
  readingCache: StorageGroupStatistics
  readingLibrary: StorageGroupStatistics
  recoveryFiles: StorageGroupStatistics
  settings: StorageGroupStatistics
  shelfImageCacheBytes: number
  totalDiskBytes: number
  totalManagedBytes: number
}

export interface MobilePermissionDiagnostics {
  fileImportUsesSystemPicker: true
  managedStorageWritable: boolean
  secureCredentialsAvailable: boolean
}

const emptyStatistics = (): StorageGroupStatistics => ({ byteSize: 0, fileCount: 0 })

function addStatistics(left: StorageGroupStatistics, right: StorageGroupStatistics): StorageGroupStatistics {
  return {
    byteSize: left.byteSize + right.byteSize,
    fileCount: left.fileCount + right.fileCount,
  }
}

function fileStatistics(file: File): StorageGroupStatistics {
  if (!file.exists)
    return emptyStatistics()
  const size = file.info().size
  return {
    byteSize: typeof size === 'number' && Number.isFinite(size) && size >= 0 ? size : 0,
    fileCount: 1,
  }
}

function entryStatistics(entry: Directory | File): StorageGroupStatistics {
  if (entry instanceof File)
    return fileStatistics(entry)
  if (!entry.exists)
    return emptyStatistics()
  return entry.list().reduce(
    (statistics, child) => addStatistics(statistics, entryStatistics(child)),
    emptyStatistics(),
  )
}

function directoryStatistics(...parts: string[]): StorageGroupStatistics {
  return entryStatistics(new Directory(Paths.document, ...parts))
}

function databaseBytes(fileName: string): number {
  const database = new File(new Directory(Paths.document, 'SQLite'), fileName)
  return [database, new File(`${database.uri}-wal`), new File(`${database.uri}-shm`)]
    .reduce((total, file) => total + fileStatistics(file).byteSize, 0)
}

function recoveryStatistics(): StorageGroupStatistics {
  const prefixes = [
    'memorilo-import-pending',
    'memorilo-import-previous-',
    'memorilo-import-rejected-',
  ]
  return Paths.document.list()
    .filter(entry => prefixes.some(prefix => entry.name.startsWith(prefix)))
    .reduce(
      (statistics, entry) => addStatistics(statistics, entryStatistics(entry)),
      emptyStatistics(),
    )
}

export class MobileStorageManager {
  inspect(): MobileStorageSnapshot {
    const assets = directoryStatistics('memorilo-assets')
    const generatedExports = directoryStatistics('memorilo-exports')
    const readingCache = directoryStatistics('memorilo-readings', 'cache')
    const readingLibrary = directoryStatistics('memorilo-readings', 'library')
    const recoveryFiles = recoveryStatistics()
    const settings = directoryStatistics('memorilo-settings')
    const mainDatabaseBytes = databaseBytes(mobileDatabaseName)
    const shelfImageCacheBytes = databaseBytes(mobileShelfImageCacheDatabaseName)
    const totalManagedBytes = [
      assets.byteSize,
      generatedExports.byteSize,
      mainDatabaseBytes,
      readingCache.byteSize,
      readingLibrary.byteSize,
      recoveryFiles.byteSize,
      settings.byteSize,
      shelfImageCacheBytes,
    ].reduce((total, size) => total + size, 0)

    return {
      assets,
      availableDiskBytes: Paths.availableDiskSpace,
      databaseBytes: mainDatabaseBytes,
      generatedExports,
      readingCache,
      readingLibrary,
      recoveryFiles,
      settings,
      shelfImageCacheBytes,
      totalDiskBytes: Paths.totalDiskSpace,
      totalManagedBytes,
    }
  }

  async inspectPermissions(): Promise<MobilePermissionDiagnostics> {
    return {
      fileImportUsesSystemPicker: true,
      managedStorageWritable: this.#probeManagedStorage(),
      secureCredentialsAvailable: await SecureStore.isAvailableAsync(),
    }
  }

  clearGeneratedExports(): StorageGroupStatistics {
    const exports = new Directory(Paths.document, 'memorilo-exports')
    const statistics = entryStatistics(exports)
    if (exports.exists)
      exports.delete()
    return statistics
  }

  #probeManagedStorage(): boolean {
    const directory = new Directory(Paths.document, `memorilo-diagnostics-${crypto.randomUUID()}`)
    const file = new File(directory, 'write-probe')
    try {
      directory.create({ intermediates: true })
      file.create({ overwrite: true })
      file.write('memorilo')
      return file.info().size === 8
    }
    catch {
      return false
    }
    finally {
      try {
        if (file.exists)
          file.delete()
        if (directory.exists)
          directory.delete()
      }
      catch {
        // A failed cleanup is reflected in the next storage inspection.
      }
    }
  }
}
