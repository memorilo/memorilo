import type {
  DatabaseCommand,
  DatabaseValue,
  EditorStorageDatabase,
} from '@memorilo/editor-storage/database'
import type { SQLiteDatabase } from 'expo-sqlite'
import { bundledExtensions, openDatabaseAsync } from 'expo-sqlite'

type ExpoDatabaseParameter = null | number | string | Uint8Array

export type ExpoSqliteExtensionRegistrar = (database: SQLiteDatabase) => Promise<void>

export interface ExpoEditorStorageDatabaseOptions {
  databaseName: string
  registerExtensions: ExpoSqliteExtensionRegistrar
}

interface CompileOptionRow {
  compile_options: string
}

function normalizeParameter(value: DatabaseValue): ExpoDatabaseParameter {
  if (typeof value !== 'bigint')
    return value

  const numberValue = Number(value)
  if (!Number.isSafeInteger(numberValue))
    throw new RangeError(`Expo SQLite cannot preserve integer ${value}`)
  return numberValue
}

function normalizeParameters(parameters: readonly DatabaseValue[]): ExpoDatabaseParameter[] {
  return parameters.map(normalizeParameter)
}

function validateDatabaseName(databaseName: string): void {
  if (databaseName.trim().length === 0)
    throw new TypeError('Expo SQLite database name must be a non-empty string')
  if (databaseName.includes('/') || databaseName.includes('\\'))
    throw new TypeError('Expo SQLite database name must not contain a path separator')
}

export class ExpoEditorStorageDatabase implements EditorStorageDatabase {
  readonly #database: SQLiteDatabase
  #closed = false

  constructor(database: SQLiteDatabase) {
    this.#database = database
  }

  async all<Row>(sql: string, parameters: readonly DatabaseValue[] = []): Promise<readonly Row[]> {
    this.#assertOpen()
    return this.#database.getAllAsync<Row>(sql, normalizeParameters(parameters))
  }

  async batch(commands: readonly DatabaseCommand[]): Promise<void> {
    this.#assertOpen()
    await this.#database.withExclusiveTransactionAsync(async (transaction) => {
      for (const command of commands)
        await transaction.runAsync(command.sql, normalizeParameters(command.parameters ?? []))
    })
  }

  async close(): Promise<void> {
    if (this.#closed)
      return
    this.#closed = true
    await this.#database.closeAsync()
  }

  async exec(sql: string): Promise<void> {
    this.#assertOpen()
    await this.#database.execAsync(sql)
  }

  async get<Row>(sql: string, parameters: readonly DatabaseValue[] = []): Promise<Row | undefined> {
    this.#assertOpen()
    const row = await this.#database.getFirstAsync<Row>(sql, normalizeParameters(parameters))
    return row === null ? undefined : row
  }

  async run(sql: string, parameters: readonly DatabaseValue[] = []): Promise<void> {
    this.#assertOpen()
    await this.#database.runAsync(sql, normalizeParameters(parameters))
  }

  #assertOpen(): void {
    if (this.#closed)
      throw new Error('Expo SQLite database is closed')
  }
}

export async function registerBundledExpoSqliteExtensions(database: SQLiteDatabase): Promise<void> {
  const extension = bundledExtensions['sqlite-vec']
  if (!extension)
    throw new Error('Expo SQLite sqlite-vec is not bundled; enable withSQLiteVecExtension in app.json')
  await database.loadExtensionAsync(extension.libPath, extension.entryPoint ?? undefined)
}

export async function verifyExpoSqliteCapabilities(database: EditorStorageDatabase): Promise<void> {
  const compileOptions = await database.all<CompileOptionRow>('PRAGMA compile_options')
  if (!compileOptions.some(row => row.compile_options === 'ENABLE_FTS5'))
    throw new Error('Expo SQLite was built without FTS5 support')

  await database.exec(`
    CREATE VIRTUAL TABLE temp.memorilo_fts5_probe USING fts5(
      value,
      tokenize='trigram'
    );
    DROP TABLE temp.memorilo_fts5_probe;
  `)
  await database.exec(`
    CREATE VIRTUAL TABLE temp.memorilo_vec0_probe USING vec0(
      embedding FLOAT[1]
    );
    DROP TABLE temp.memorilo_vec0_probe;
  `)
}

export async function openExpoEditorStorageDatabase(
  options: ExpoEditorStorageDatabaseOptions,
): Promise<ExpoEditorStorageDatabase> {
  validateDatabaseName(options.databaseName)
  const nativeDatabase = await openDatabaseAsync(options.databaseName)
  const database = new ExpoEditorStorageDatabase(nativeDatabase)
  try {
    await options.registerExtensions(nativeDatabase)
    await database.exec(`
      PRAGMA foreign_keys = ON;
      PRAGMA journal_mode = WAL;
      PRAGMA busy_timeout = 5000;
    `)
    await verifyExpoSqliteCapabilities(database)
    return database
  }
  catch (error) {
    await database.close()
    throw error
  }
}
