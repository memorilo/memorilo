import type { EditorStorageDatabase } from '../src/database-driver'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import process from 'node:process'
import BetterSqlite3 from 'better-sqlite3'
import * as sqliteVec from 'sqlite-vec'
import {
  inspectMainDatabaseSchema,
  prepareMainDatabase,
  serializeMainDatabaseSchemaInspection,
} from '../src/index'

class BetterSqliteInspectionDatabase implements EditorStorageDatabase {
  readonly #database: BetterSqlite3.Database

  constructor(path: string) {
    this.#database = new BetterSqlite3(path, { readonly: true })
    sqliteVec.load(this.#database)
  }

  async all<Row>(sql: string, parameters = []): Promise<readonly Row[]> {
    return this.#database.prepare(sql).all(...parameters) as Row[]
  }

  async batch(): Promise<void> {
    throw new Error('Schema inspection is read-only')
  }

  async close(): Promise<void> {
    this.#database.close()
  }

  async exec(sql: string): Promise<void> {
    this.#database.exec(sql)
  }

  async get<Row>(sql: string, parameters = []): Promise<Row | undefined> {
    return this.#database.prepare(sql).get(...parameters) as Row | undefined
  }

  async run(): Promise<void> {
    throw new Error('Schema inspection is read-only')
  }
}

const inputPath = process.argv[2]
const outputPath = process.argv[3]
if (!inputPath) {
  console.error('Usage: pnpm inspect-schema <database-path> [output-path]')
  process.exitCode = 2
}
else {
  const database = new BetterSqliteInspectionDatabase(resolve(inputPath))
  try {
    // A dump must never initialize or migrate a database. This explicit check
    // gives a clearer error for empty or unknown-generation files.
    const version = await database.get<{ user_version: number }>('PRAGMA user_version')
    if (version?.user_version !== 1)
      throw new Error(`Expected schema generation 1, found ${version?.user_version ?? 'missing'}`)
    await prepareMainDatabase(database)
    const inspection = await inspectMainDatabaseSchema(database)
    const serialized = serializeMainDatabaseSchemaInspection(inspection)
    if (outputPath) {
      const destination = resolve(outputPath)
      await mkdir(dirname(destination), { recursive: true })
      await writeFile(destination, serialized)
      console.error(`Wrote schema inspection to ${destination}`)
    }
    else {
      process.stdout.write(serialized)
    }
  }
  finally {
    await database.close()
  }
}
