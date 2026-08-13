import type {
  DatabaseCommand,
  DatabaseValue,
  EditorStorageDatabase,
} from '@memorilo/editor-storage'
import type Database from 'better-sqlite3'
import BetterSqlite3 from 'better-sqlite3'
import { getLoadablePath as getSqliteVecPath } from 'sqlite-vec'

function parameters(values: readonly DatabaseValue[] | undefined): readonly DatabaseValue[] {
  return values ?? []
}

function unpackedAsarPath(path: string): string {
  return path.replace(/([\\/])app\.asar([\\/])/u, '$1app.asar.unpacked$2')
}

export interface BetterSqliteDatabaseOptions {
  loadVectorExtension?: boolean
}

export class BetterSqliteDatabase implements EditorStorageDatabase {
  readonly #database: Database.Database
  #closed = false

  constructor(path: string, options: BetterSqliteDatabaseOptions = {}) {
    if (path.length === 0)
      throw new TypeError('Database path must be a non-empty string')

    const database = new BetterSqlite3(path)
    try {
      if (options.loadVectorExtension !== false)
        database.loadExtension(unpackedAsarPath(getSqliteVecPath()))
      database.pragma('journal_mode = WAL')
    }
    catch (error) {
      database.close()
      throw error
    }
    this.#database = database
  }

  async all<Row>(sql: string, values?: readonly DatabaseValue[]): Promise<readonly Row[]> {
    this.#assertOpen()
    return this.#database.prepare(sql).all(...parameters(values)) as Row[]
  }

  async batch(commands: readonly DatabaseCommand[]): Promise<void> {
    this.#assertOpen()
    const execute = this.#database.transaction(() => {
      for (const command of commands)
        this.#database.prepare(command.sql).run(...parameters(command.parameters))
    })
    execute()
  }

  async close(): Promise<void> {
    if (this.#closed)
      return
    this.#closed = true
    this.#database.close()
  }

  async exec(sql: string): Promise<void> {
    this.#assertOpen()
    this.#database.exec(sql)
  }

  async get<Row>(sql: string, values?: readonly DatabaseValue[]): Promise<Row | undefined> {
    this.#assertOpen()
    return this.#database.prepare(sql).get(...parameters(values)) as Row | undefined
  }

  async run(sql: string, values?: readonly DatabaseValue[]): Promise<void> {
    this.#assertOpen()
    this.#database.prepare(sql).run(...parameters(values))
  }

  #assertOpen(): void {
    if (this.#closed)
      throw new Error('The SQLite database is closed')
  }
}
