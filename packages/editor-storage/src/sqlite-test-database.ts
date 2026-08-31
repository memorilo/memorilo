import type Database from 'better-sqlite3'
import type { DatabaseCommand, DatabaseValue, EditorStorageDatabase } from './database-driver'
import { fileURLToPath } from 'node:url'
import BetterSqlite3 from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate as migrateDrizzle } from 'drizzle-orm/better-sqlite3/migrator'
import * as sqliteVec from 'sqlite-vec'
import { editorStorageDrizzleSchema } from './drizzle-schema'

function parameters(values: readonly DatabaseValue[] | undefined): readonly DatabaseValue[] {
  return values ?? []
}

export class SqliteTestDatabase implements EditorStorageDatabase {
  readonly #database: Database.Database
  readonly #drizzle
  get drizzle() {
    return this.#drizzle
  }

  beforeGet?: (sql: string) => Promise<void>
  get beforeDrizzleRead(): ((sql: string) => Promise<void>) | undefined {
    return this.beforeGet
  }

  failNextBatch = false
  failNextVacuum = false

  constructor(path = ':memory:') {
    this.#database = new BetterSqlite3(path)
    sqliteVec.load(this.#database)
    this.#database.pragma('foreign_keys = ON')
    this.#database.pragma('busy_timeout = 5000')
    this.#drizzle = drizzle(this.#database, { schema: editorStorageDrizzleSchema })
  }

  migrate(): void {
    migrateDrizzle(this.#drizzle, {
      migrationsFolder: fileURLToPath(new URL('../drizzle', import.meta.url)),
    })
  }

  async all<Row>(sql: string, values?: readonly DatabaseValue[]): Promise<readonly Row[]> {
    return this.#database.prepare(sql).all(...parameters(values)) as Row[]
  }

  async batch(commands: readonly DatabaseCommand[]): Promise<void> {
    const execute = this.#database.transaction(() => {
      for (const command of commands)
        command.drizzle(this.#drizzle)
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

  async executeInfrastructureSql(sql: string): Promise<void> {
    if (sql === 'VACUUM' && this.failNextVacuum) {
      this.failNextVacuum = false
      throw new Error('Injected VACUUM failure')
    }
    this.#database.exec(sql)
  }

  async exec(sql: string): Promise<void> {
    return this.executeInfrastructureSql(sql)
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
