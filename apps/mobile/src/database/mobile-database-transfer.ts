import type { EditorStorageDatabase } from '@memorilo/editor-storage/database'
import { mainDatabaseSchemaGeneration } from '@memorilo/editor-storage'
import {
  BlobReader,
  BlobWriter,
  TextReader,
  Uint8ArrayWriter,
  ZipReader,
  ZipWriter,
} from '@zip.js/zip.js'
import { Directory, File, Paths } from 'expo-file-system'

const exportFormat = 'memorilo-mobile-database-export'
const exportFormatVersion = 1
const pendingImportDirectoryName = 'memorilo-import-pending'
const rejectedImportDirectoryPrefix = 'memorilo-import-rejected-'
const exportDirectoryName = 'memorilo-exports'
const databaseDirectoryName = 'SQLite'
const databaseFileName = 'memorilo.sqlite'
const assetDirectoryName = 'memorilo-assets'
const readingDirectoryName = 'memorilo-readings'

interface ExportManifestFile {
  byteSize: number
  path: string
}

interface MobileDatabaseExportManifest {
  createdAt: string
  databaseSchemaGeneration: number
  files: readonly ExportManifestFile[]
  format: typeof exportFormat
  formatVersion: typeof exportFormatVersion
}

interface ArchiveSource {
  archivePath: string
  file: File
}

interface MobileDatabaseTransferOptions {
  database: EditorStorageDatabase
}

export interface MobileDatabaseExportResult {
  byteSize: number
  file: File
  schemaGeneration: number
}

export type MobileDatabaseImportResult
  = | { status: 'cancelled' }
    | { byteSize: number, fileName: string, restartRequired: true, status: 'staged' }

function directory(...parts: string[]): Directory {
  return new Directory(Paths.document, ...parts)
}

function mainDatabaseFile(): File {
  return new File(directory(databaseDirectoryName), databaseFileName)
}

function isDirectory(value: Directory | File): value is Directory {
  return value instanceof Directory
}

function isFile(value: Directory | File): value is File {
  return value instanceof File
}

function archivePathSegments(path: string): readonly string[] {
  if (path.length === 0 || path.startsWith('/') || path.includes('\\') || path.includes('\0'))
    throw new Error(`Mobile database export contains an invalid path: ${path}`)
  const segments = path.split('/')
  if (segments.some(segment => segment.length === 0 || segment === '.' || segment === '..'))
    throw new Error(`Mobile database export path escapes its root: ${path}`)
  return segments
}

function isSupportedArchivePath(path: string): boolean {
  return path === 'database.sqlite'
    || path.startsWith('assets/')
    || path.startsWith('readings/')
}

function schemaGenerationFromDatabase(bytes: Uint8Array): number {
  const header = new TextDecoder().decode(bytes.slice(0, 16))
  if (header !== 'SQLite format 3\0')
    throw new Error('The imported file is not a SQLite database')
  if (bytes.byteLength < 64)
    throw new Error('The imported SQLite database header is truncated')
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(60, false)
}

function parseManifest(value: unknown): MobileDatabaseExportManifest {
  if (value === null || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Mobile database export manifest must be an object')
  const manifest = value as Partial<MobileDatabaseExportManifest>
  if (manifest.format !== exportFormat || manifest.formatVersion !== exportFormatVersion)
    throw new Error('Mobile database export format is not supported')
  if (manifest.databaseSchemaGeneration !== mainDatabaseSchemaGeneration)
    throw new Error(`Mobile database export requires schema generation ${mainDatabaseSchemaGeneration}`)
  if (!Array.isArray(manifest.files) || !manifest.files.some(file => file?.path === 'database.sqlite'))
    throw new Error('Mobile database export does not contain database.sqlite')
  const paths = new Set<string>()
  for (const file of manifest.files) {
    if (file === null || typeof file !== 'object' || typeof file.path !== 'string')
      throw new Error('Mobile database export contains an invalid file entry')
    archivePathSegments(file.path)
    if (!isSupportedArchivePath(file.path))
      throw new Error(`Mobile database export contains an unsupported path: ${file.path}`)
    if (!Number.isSafeInteger(file.byteSize) || file.byteSize < 0)
      throw new Error(`Mobile database export contains an invalid size: ${file.path}`)
    if (paths.has(file.path))
      throw new Error(`Mobile database export contains a duplicate path: ${file.path}`)
    paths.add(file.path)
  }
  return manifest as MobileDatabaseExportManifest
}

async function collectFiles(root: Directory, prefix: string): Promise<readonly ArchiveSource[]> {
  if (!root.exists)
    return []
  const files: ArchiveSource[] = []
  for (const entry of root.list()) {
    if (isFile(entry)) {
      files.push({ archivePath: `${prefix}/${entry.name}`, file: entry })
    }
    else if (isDirectory(entry)) {
      files.push(...await collectFiles(entry, `${prefix}/${entry.name}`))
    }
  }
  return files.sort((left, right) => left.archivePath.localeCompare(right.archivePath))
}

async function writeFileBytes(file: File, bytes: Uint8Array): Promise<void> {
  file.create({ intermediates: true, overwrite: true })
  file.write(bytes)
}

async function moveFileIfPresent(source: File, destination: File): Promise<boolean> {
  if (!source.exists)
    return false
  destination.parentDirectory.create({ idempotent: true, intermediates: true })
  await source.move(destination, { overwrite: true })
  return true
}

async function moveDirectoryIfPresent(source: Directory, destination: Directory): Promise<boolean> {
  if (!source.exists)
    return false
  destination.parentDirectory.create({ idempotent: true, intermediates: true })
  await source.move(destination, { overwrite: true })
  return true
}

async function deleteIfPresent(value: Directory | File): Promise<void> {
  if (value.exists)
    value.delete()
}

async function quarantinePendingImport(pending: Directory, failure: unknown): Promise<void> {
  if (!pending.exists)
    return
  const reason = failure instanceof Error ? failure.message : String(failure)
  try {
    await writeFileBytes(
      new File(pending, 'error.txt'),
      new TextEncoder().encode(`${reason}\n`),
    )
  }
  catch {
    // The import must still be moved out of the startup path if diagnostics
    // cannot be written (for example, because storage is read-only).
  }
  const rejected = directory(`${rejectedImportDirectoryPrefix}${crypto.randomUUID()}`)
  try {
    await pending.move(rejected, { overwrite: false })
  }
  catch {
    // Preserve the original import failure. A later startup can retry the
    // quarantine after a transient filesystem failure has cleared.
  }
}

async function validateStagedDatabase(database: File): Promise<void> {
  const bytes = await database.bytes()
  const generation = schemaGenerationFromDatabase(bytes)
  if (generation !== mainDatabaseSchemaGeneration)
    throw new Error(`Imported database schema generation ${generation} is not supported`)
}

export async function applyPendingMobileDatabaseImport(): Promise<boolean> {
  const pending = directory(pendingImportDirectoryName)
  if (!pending.exists)
    return false

  try {
    return await applyPendingImport(pending)
  }
  catch (error) {
    await quarantinePendingImport(pending, error)
    throw error
  }
}

async function applyPendingImport(pending: Directory): Promise<boolean> {
  const stagedDatabase = new File(pending, 'database.sqlite')
  await validateStagedDatabase(stagedDatabase)
  const backup = directory(`memorilo-import-previous-${crypto.randomUUID()}`)
  backup.create({ intermediates: true })

  const currentDatabase = mainDatabaseFile()
  const currentDatabaseWal = new File(`${currentDatabase.uri}-wal`)
  const currentDatabaseShm = new File(`${currentDatabase.uri}-shm`)
  const currentAssets = directory(assetDirectoryName)
  const currentReadings = directory(readingDirectoryName)
  const backupDatabase = new File(backup, 'database.sqlite')
  const backupDatabaseWal = new File(backup, 'database.sqlite-wal')
  const backupDatabaseShm = new File(backup, 'database.sqlite-shm')
  const backupAssets = new Directory(backup, 'assets')
  const backupReadings = new Directory(backup, 'readings')
  const stagedAssets = new Directory(pending, 'assets')
  const stagedReadings = new Directory(pending, 'readings')
  let movedDatabase = false
  let movedDatabaseWal = false
  let movedDatabaseShm = false
  let movedAssets = false
  let movedReadings = false
  let installedDatabase = false
  let installedAssets = false
  let installedReadings = false

  try {
    movedDatabase = await moveFileIfPresent(currentDatabase, backupDatabase)
    movedDatabaseWal = await moveFileIfPresent(currentDatabaseWal, backupDatabaseWal)
    movedDatabaseShm = await moveFileIfPresent(currentDatabaseShm, backupDatabaseShm)
    // An archive may legitimately contain no assets or readings. Only move a
    // current directory when the import supplies its replacement; otherwise
    // the user's existing files remain untouched.
    await stagedDatabase.move(currentDatabase, { overwrite: true })
    installedDatabase = true
    if (stagedAssets.exists) {
      movedAssets = await moveDirectoryIfPresent(currentAssets, backupAssets)
      await stagedAssets.move(currentAssets, { overwrite: true })
      installedAssets = true
    }
    if (stagedReadings.exists) {
      movedReadings = await moveDirectoryIfPresent(currentReadings, backupReadings)
      await stagedReadings.move(currentReadings, { overwrite: true })
      installedReadings = true
    }
    await deleteIfPresent(pending)
    await deleteIfPresent(backup)
    return true
  }
  catch (error) {
    if (installedReadings)
      await deleteIfPresent(currentReadings)
    if (installedAssets)
      await deleteIfPresent(currentAssets)
    if (installedDatabase)
      await deleteIfPresent(currentDatabase)
    if (movedReadings)
      await backupReadings.move(currentReadings, { overwrite: true })
    if (movedAssets)
      await backupAssets.move(currentAssets, { overwrite: true })
    if (movedDatabaseShm)
      await backupDatabaseShm.move(currentDatabaseShm, { overwrite: true })
    if (movedDatabaseWal)
      await backupDatabaseWal.move(currentDatabaseWal, { overwrite: true })
    if (movedDatabase)
      await backupDatabase.move(currentDatabase, { overwrite: true })
    throw error
  }
}

export class MobileDatabaseTransfer {
  readonly #database: EditorStorageDatabase

  constructor(options: MobileDatabaseTransferOptions) {
    this.#database = options.database
  }

  async exportDatabase(): Promise<MobileDatabaseExportResult> {
    await this.#database.exec('PRAGMA wal_checkpoint(TRUNCATE)')
    const database = mainDatabaseFile()
    if (!database.exists)
      throw new Error('The mobile database file is unavailable for export')
    const sources: ArchiveSource[] = [
      { archivePath: 'database.sqlite', file: database },
      ...await collectFiles(directory(assetDirectoryName), 'assets'),
      ...await collectFiles(directory(readingDirectoryName), 'readings'),
    ]
    const files = sources.map((source) => {
      const size = source.file.info().size
      if (size === null || size === undefined || !Number.isSafeInteger(size) || size < 0)
        throw new Error(`Cannot determine the size of ${source.archivePath}`)
      return { byteSize: size, path: source.archivePath }
    })
    const manifest: MobileDatabaseExportManifest = {
      createdAt: new Date().toISOString(),
      databaseSchemaGeneration: mainDatabaseSchemaGeneration,
      files,
      format: exportFormat,
      formatVersion: exportFormatVersion,
    }
    const outputDirectory = directory(exportDirectoryName)
    outputDirectory.create({ idempotent: true, intermediates: true })
    const fileName = `Memorilo-${new Date().toISOString().replace(/[-:]/gu, '').replace(/\.\d{3}/u, '')}.memorilo.zip`
    const output = new File(outputDirectory, fileName)
    const writer = new BlobWriter('application/zip')
    const zip = new ZipWriter(writer, { useWebWorkers: false })
    try {
      for (const source of sources)
        await zip.add(source.archivePath, new BlobReader(source.file))
      await zip.add('manifest.json', new TextReader(`${JSON.stringify(manifest)}\n`))
      await zip.close()
      const archive = await writer.getData()
      await writeFileBytes(output, new Uint8Array(await archive.arrayBuffer()))
    }
    catch (error) {
      await zip.close().catch(() => undefined)
      throw error
    }
    const byteSize = output.info().size
    if (byteSize === null || byteSize === undefined)
      throw new Error('Cannot determine the exported database size')
    return { byteSize, file: output, schemaGeneration: mainDatabaseSchemaGeneration }
  }

  async stageImportFromPicker(): Promise<MobileDatabaseImportResult> {
    const picked = await File.pickFileAsync({
      mimeTypes: ['application/zip', 'application/octet-stream'],
    })
    if (picked.canceled)
      return { status: 'cancelled' }
    const source = picked.result
    const pending = directory(pendingImportDirectoryName)
    if (pending.exists)
      throw new Error('A database import is already waiting for app restart')
    const staging = directory(`memorilo-import-staging-${crypto.randomUUID()}`)
    staging.create({ intermediates: true })
    try {
      const reader = new ZipReader(new BlobReader(source), { useWebWorkers: false })
      try {
        const entries = await reader.getEntries()
        const entryMap = new Map(entries.map(entry => [entry.filename, entry]))
        const manifestEntry = entryMap.get('manifest.json')
        if (!manifestEntry || manifestEntry.directory)
          throw new Error('Mobile database export is missing manifest.json')
        const manifestBytes = await manifestEntry.getData(new Uint8ArrayWriter())
        const manifest = parseManifest(JSON.parse(new TextDecoder().decode(manifestBytes)))
        const expected = new Map(manifest.files.map(file => [file.path, file]))
        for (const entry of entries) {
          if (entry.directory)
            continue
          if (entry.filename === 'manifest.json')
            continue
          archivePathSegments(entry.filename)
          if (!isSupportedArchivePath(entry.filename) || !expected.has(entry.filename))
            throw new Error(`Mobile database export contains an unexpected file: ${entry.filename}`)
          const bytes = await entry.getData(new Uint8ArrayWriter())
          const expectedFile = expected.get(entry.filename)
          if (!expectedFile || expectedFile.byteSize !== bytes.byteLength)
            throw new Error(`Mobile database export size mismatch: ${entry.filename}`)
          const destination = new File(staging, ...archivePathSegments(entry.filename))
          await writeFileBytes(destination, bytes)
          expected.delete(entry.filename)
        }
        if (expected.size > 0)
          throw new Error(`Mobile database export is missing: ${[...expected.keys()].join(', ')}`)
        await validateStagedDatabase(new File(staging, 'database.sqlite'))
        await writeFileBytes(new File(staging, 'manifest.json'), new TextEncoder().encode(JSON.stringify(manifest)))
        await staging.move(pending, { overwrite: false })
        const byteSize = source.info().size
        if (byteSize === null || byteSize === undefined)
          throw new Error('Cannot determine the imported database export size')
        return { byteSize, fileName: source.name, restartRequired: true, status: 'staged' }
      }
      finally {
        await reader.close().catch(() => undefined)
      }
    }
    catch (error) {
      await deleteIfPresent(staging)
      throw error
    }
  }
}
