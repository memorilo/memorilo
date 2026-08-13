import type Database from 'better-sqlite3'
import type { DatabaseCommand, DatabaseValue, EditorStorageDatabase } from './database-driver'
import BetterSqlite3 from 'better-sqlite3'
import * as sqliteVec from 'sqlite-vec'

function parameters(values: readonly DatabaseValue[] | undefined): readonly DatabaseValue[] {
  return values ?? []
}

export class SqliteTestDatabase implements EditorStorageDatabase {
  readonly #database: Database.Database
  beforeGet?: (sql: string) => Promise<void>
  failNextBatch = false
  failNextVacuum = false

  constructor(path = ':memory:') {
    this.#database = new BetterSqlite3(path)
    sqliteVec.load(this.#database)
  }

  async all<Row>(sql: string, values?: readonly DatabaseValue[]): Promise<readonly Row[]> {
    return this.#database.prepare(sql).all(...parameters(values)) as Row[]
  }

  async batch(commands: readonly DatabaseCommand[]): Promise<void> {
    const execute = this.#database.transaction(() => {
      for (const command of commands)
        this.#database.prepare(command.sql).run(...parameters(command.parameters))
      if (this.failNextBatch) {
        this.failNextBatch = false
        throw new Error('Injected batch failure')
      }
    })
    execute()
  }

  async close(): Promise<void> {
    this.#database.close()
  }

  async exec(sql: string): Promise<void> {
    if (sql === 'VACUUM' && this.failNextVacuum) {
      this.failNextVacuum = false
      throw new Error('Injected VACUUM failure')
    }
    this.#database.exec(sql)
  }

  async get<Row>(sql: string, values?: readonly DatabaseValue[]): Promise<Row | undefined> {
    const row = this.#database.prepare(sql).get(...parameters(values)) as Row | undefined
    await this.beforeGet?.(sql)
    return row
  }

  async run(sql: string, values?: readonly DatabaseValue[]): Promise<void> {
    this.#database.prepare(sql).run(...parameters(values))
  }
}
