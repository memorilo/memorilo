import { afterEach, describe, expect, it } from 'vitest'
import { BetterSqliteDatabase } from './better-sqlite-database'

const databases: BetterSqliteDatabase[] = []

function createDatabase(): BetterSqliteDatabase {
  const database = new BetterSqliteDatabase(':memory:')
  databases.push(database)
  return database
}

afterEach(async () => {
  await Promise.all(databases.splice(0).map(database => database.close()))
})

describe('better-sqlite editor storage database', () => {
  it('rolls back the whole batch when one command fails', async () => {
    const database = createDatabase()
    await database.exec('CREATE TABLE records (id INTEGER PRIMARY KEY, value TEXT NOT NULL)')

    await expect(database.batch([
      { parameters: [1, 'first'], sql: 'INSERT INTO records (id, value) VALUES (?, ?)' },
      { parameters: [1, 'duplicate'], sql: 'INSERT INTO records (id, value) VALUES (?, ?)' },
    ])).rejects.toThrow()

    expect(await database.all('SELECT id, value FROM records')).toEqual([])
  })
})
