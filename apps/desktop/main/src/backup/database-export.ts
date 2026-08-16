import type { Stats } from 'node:fs'
import type { Pack } from 'tar-stream'
import type { BetterSqliteDatabase } from '../storage/better-sqlite-database'
import { randomUUID } from 'node:crypto'
import { createReadStream, createWriteStream } from 'node:fs'
import {
  cp,
  lstat,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, isAbsolute, join, posix, relative, sep } from 'node:path'
import { pipeline } from 'node:stream/promises'
import { createZstdCompress, createZstdDecompress } from 'node:zlib'

import {
  combineLifecycleFailures,
  runLifecycleOperations,
  toError,
} from '@memorilo/effect-lifecycle'
import * as tar from 'tar-stream'
import { createDatabaseSnapshot, inspectDatabase } from './database-backup'

const databaseEntryPath = 'database.sqlite'
const exportFormat = 'memorilo-database-export'
const exportFormatVersion = 1
const manifestEntryPath = 'manifest.json'

interface ExportFileManifest {
  byteSize: number
  path: string
}

interface DatabaseExportManifest {
  appVersion: string
  createdAt: string
  databaseSchemaGeneration: number
  files: readonly ExportFileManifest[]
  format: typeof exportFormat
  formatVersion: typeof exportFormatVersion
}

export interface DatabaseExportInspection {
  databaseSchemaGeneration: number
  kind: 'export'
}

interface ExportInput {
  appVersion: string
  assetDirectory: string
  database: BetterSqliteDatabase
  destinationPath: string
  shelfDirectory: string
}

interface StagedFile {
  absolutePath: string
  archivePath: string
  metadata: Stats
}

function archivePath(root: string, path: string): string {
  return relative(root, path).split(sep).join('/')
}

async function copyDirectory(source: string, destination: string): Promise<void> {
  try {
    const metadata = await stat(source)
    if (!metadata.isDirectory())
      throw new Error(`Export source is not a directory: ${source}`)
    await cp(source, destination, { recursive: true })
  }
  catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      await mkdir(destination, { recursive: true })
      return
    }
    throw error
  }
}

async function listStagedFiles(root: string, directory: string = root): Promise<readonly StagedFile[]> {
  const entries = await readdir(directory, { withFileTypes: true })
  const files: StagedFile[] = []
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const absolutePath = join(directory, entry.name)
    const metadata = await lstat(absolutePath)
    if (metadata.isSymbolicLink())
      throw new Error(`Database export cannot contain symbolic links: ${archivePath(root, absolutePath)}`)
    if (metadata.isDirectory()) {
      files.push(...await listStagedFiles(root, absolutePath))
      continue
    }
    if (!metadata.isFile())
      throw new Error(`Database export cannot contain special files: ${archivePath(root, absolutePath)}`)
    files.push({ absolutePath, archivePath: archivePath(root, absolutePath), metadata })
  }
  return files
}

async function addFile(pack: Pack, file: StagedFile): Promise<void> {
  const entry = pack.entry({
    mode: file.metadata.mode & 0o777,
    mtime: new Date(0),
    name: file.archivePath,
    size: file.metadata.size,
    type: 'file',
  })
  await pipeline(createReadStream(file.absolutePath), entry)
}

async function writeCompressedArchive(root: string, destinationPath: string): Promise<void> {
  const temporaryPath = join(
    dirname(destinationPath),
    `.${basename(destinationPath)}.${randomUUID()}.tmp`,
  )
  const pack = tar.pack()
  const writing = pipeline(
    pack,
    createZstdCompress(),
    createWriteStream(temporaryPath, { flags: 'wx' }),
  )
  let writingComplete = false
  try {
    for (const file of await listStagedFiles(root))
      await addFile(pack, file)
    pack.finalize()
    await writing
    writingComplete = true
    await rename(temporaryPath, destinationPath)
  }
  catch (error) {
    const archiveError = toError(error)
    try {
      await runLifecycleOperations([
        () => pack.destroy(archiveError),
        ...writingComplete
          ? []
          : [() => writing.catch((writingError) => {
              if (writingError !== error)
                throw writingError
            })],
        () => rm(temporaryPath, { force: true }),
      ], `Failed to clean up database export ${temporaryPath}`, 'sequential')
    }
    catch (cleanupError) {
      throw combineLifecycleFailures(
        [archiveError, cleanupError],
        `Database export and cleanup failed for ${destinationPath}`,
      )
    }
    throw archiveError
  }
}

export async function exportDatabase(input: ExportInput): Promise<void> {
  await mkdir(dirname(input.destinationPath), { recursive: true })
  const temporaryRoot = await mkdtemp(join(tmpdir(), 'memorilo-database-export-'))
  try {
    const payloadRoot = join(temporaryRoot, 'payload')
    await mkdir(payloadRoot)
    const databaseInspection = await createDatabaseSnapshot(
      input.database,
      join(payloadRoot, databaseEntryPath),
    )
    await Promise.all([
      copyDirectory(input.assetDirectory, join(payloadRoot, 'assets')),
      copyDirectory(input.shelfDirectory, join(payloadRoot, 'shelf')),
    ])
    const files = (await listStagedFiles(payloadRoot)).map(file => ({
      byteSize: file.metadata.size,
      path: file.archivePath,
    }))
    const manifest: DatabaseExportManifest = {
      appVersion: input.appVersion,
      createdAt: new Date().toISOString(),
      databaseSchemaGeneration: databaseInspection.userVersion,
      files,
      format: exportFormat,
      formatVersion: exportFormatVersion,
    }
    await writeFile(
      join(payloadRoot, manifestEntryPath),
      `${JSON.stringify(manifest, null, 2)}\n`,
      { encoding: 'utf8', flag: 'wx' },
    )
    await writeCompressedArchive(payloadRoot, input.destinationPath)
  }
  catch (error) {
    const exportError = toError(error)
    try {
      await rm(temporaryRoot, { force: true, recursive: true })
    }
    catch (cleanupError) {
      throw combineLifecycleFailures(
        [exportError, cleanupError],
        `Database export and staging cleanup failed for ${input.destinationPath}`,
      )
    }
    throw exportError
  }
  try {
    await rm(temporaryRoot, { force: true, recursive: true })
  }
  catch (cleanupError) {
    throw new Error(`Failed to clean up database export staging ${temporaryRoot}`, { cause: cleanupError })
  }
}

function validatedArchiveEntryPath(name: string): readonly string[] {
  if (name.length === 0 || isAbsolute(name) || name.includes('\\'))
    throw new Error(`Database export contains an invalid path: ${name}`)
  const normalized = posix.normalize(name)
  if (normalized !== name || normalized === '..' || normalized.startsWith('../'))
    throw new Error(`Database export path escapes its root: ${name}`)
  return name.split('/')
}

async function extractEntry(
  root: string,
  header: tar.Headers,
  stream: NodeJS.ReadableStream,
  seen: Set<string>,
): Promise<void> {
  if (header.type !== 'file')
    throw new Error(`Database export contains unsupported entry type: ${header.type ?? 'unknown'}`)
  if (seen.has(header.name))
    throw new Error(`Database export contains a duplicate path: ${header.name}`)
  seen.add(header.name)
  const segments = validatedArchiveEntryPath(header.name)
  const destinationPath = join(root, ...segments)
  await mkdir(dirname(destinationPath), { recursive: true })
  await pipeline(stream, createWriteStream(destinationPath, { flags: 'wx', mode: 0o600 }))
}

async function readManifest(root: string): Promise<DatabaseExportManifest> {
  const text = await readFile(join(root, manifestEntryPath), 'utf8')
  let value: unknown
  try {
    value = JSON.parse(text)
  }
  catch (error) {
    throw new Error('Database export manifest is not valid JSON', { cause: error })
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new Error('Database export manifest must be an object')
  const manifest = value as Partial<DatabaseExportManifest>
  if (manifest.format !== exportFormat || manifest.formatVersion !== exportFormatVersion)
    throw new Error('Database export format is not supported')
  if (!Number.isSafeInteger(manifest.databaseSchemaGeneration)
    || (manifest.databaseSchemaGeneration as number) < 0) {
    throw new Error('Database export has an invalid schema generation')
  }
  if (!Array.isArray(manifest.files))
    throw new Error('Database export manifest has no file inventory')
  for (const file of manifest.files) {
    if (typeof file !== 'object' || file === null)
      throw new Error('Database export manifest has an invalid file entry')
    validatedArchiveEntryPath(file.path)
    if (!Number.isSafeInteger(file.byteSize) || file.byteSize < 0)
      throw new Error(`Database export manifest has an invalid size for ${file.path}`)
  }
  return manifest as DatabaseExportManifest
}

export async function extractDatabaseExport(
  sourcePath: string,
  destinationRoot: string,
): Promise<DatabaseExportInspection> {
  await mkdir(destinationRoot, { recursive: true })
  const extract = tar.extract()
  const seen = new Set<string>()
  extract.on('entry', (header, stream, next) => {
    void extractEntry(destinationRoot, header, stream, seen).then(
      () => next(),
      error => next(error),
    )
  })
  await pipeline(createReadStream(sourcePath), createZstdDecompress(), extract)

  const manifest = await readManifest(destinationRoot)
  const expectedPaths = new Set(manifest.files.map(file => file.path))
  if (!expectedPaths.has(databaseEntryPath))
    throw new Error('Database export manifest does not include database.sqlite')
  for (const file of manifest.files) {
    const metadata = await stat(join(destinationRoot, ...validatedArchiveEntryPath(file.path)))
    if (!metadata.isFile() || metadata.size !== file.byteSize)
      throw new Error(`Database export file does not match its manifest: ${file.path}`)
  }
  const unexpected = [...seen].filter(path => path !== manifestEntryPath && !expectedPaths.has(path))
  if (unexpected.length > 0)
    throw new Error(`Database export contains files absent from its manifest: ${unexpected.join(', ')}`)
  const databaseInspection = inspectDatabase(join(destinationRoot, databaseEntryPath))
  if (databaseInspection.userVersion !== manifest.databaseSchemaGeneration)
    throw new Error('Database export schema generation does not match database.sqlite')
  await Promise.all([
    mkdir(join(destinationRoot, 'assets'), { recursive: true }),
    mkdir(join(destinationRoot, 'shelf'), { recursive: true }),
  ])
  return {
    databaseSchemaGeneration: databaseInspection.userVersion,
    kind: 'export',
  }
}
