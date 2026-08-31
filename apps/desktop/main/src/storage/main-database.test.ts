import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { sql } from 'drizzle-orm'
import { sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { afterEach, describe, expect, it } from 'vitest'
import { openCurrentMainDatabase } from './main-database'

const temporaryDirectories: string[] = []
const retained = sqliteTable('retained', { value: text().notNull() })

async function databasePath(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'memorilo-main-database-'))
  temporaryDirectories.push(directory)
  return join(directory, 'memorilo.sqlite')
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(directory => (
    rm(directory, { force: true, recursive: true })
  )))
})

describe('main database', () => {
  it('preserves data while Drizzle owns the schema generation', async () => {
    const path = await databasePath()
    const first = await openCurrentMainDatabase(path)
    first.migrate()
    const firstGeneration = first.drizzle.get<{ user_version: number }>(sql`PRAGMA user_version`)
    expect(firstGeneration?.user_version).toBeGreaterThan(0)
    first.drizzle.run(sql`CREATE TABLE ${retained} (value TEXT NOT NULL)`)
    first.drizzle.insert(retained).values({ value: 'current' }).run()
    await first.close()

    const second = await openCurrentMainDatabase(path)
    second.migrate()
    expect(second.drizzle.select().from(retained).get()).toEqual({ value: 'current' })
    expect(second.drizzle.get<{ user_version: number }>(sql`PRAGMA user_version`)).toEqual({
      user_version: firstGeneration?.user_version,
    })
    await second.close()
  })
})
