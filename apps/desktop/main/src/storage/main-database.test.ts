import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { BetterSqliteDatabase } from './better-sqlite-database'
import { mainDatabaseSchemaGeneration, openCurrentMainDatabase } from './main-database'

const temporaryDirectories: string[] = []

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

describe('main database generation', () => {
  it('preserves data after the current generation has been established', async () => {
    const path = await databasePath()
    const first = await openCurrentMainDatabase(path)
    await first.exec('CREATE TABLE retained (value TEXT NOT NULL)')
    await first.run('INSERT INTO retained (value) VALUES (?)', ['current'])
    await first.close()

    const second = await openCurrentMainDatabase(path)
    await expect(second.get<{ value: string }>('SELECT value FROM retained')).resolves.toEqual({ value: 'current' })
    await expect(second.get<{ user_version: number }>('PRAGMA user_version')).resolves.toEqual({
      user_version: mainDatabaseSchemaGeneration,
    })
    await second.close()
  })

  it('deletes an unversioned legacy database before opening the current generation', async () => {
    const path = await databasePath()
    const legacy = new BetterSqliteDatabase(path)
    await legacy.exec('CREATE TABLE legacy_notes (value TEXT NOT NULL)')
    await legacy.run('INSERT INTO legacy_notes (value) VALUES (?)', ['delete me'])
    await legacy.close()

    const current = await openCurrentMainDatabase(path)

    await expect(current.get<{ name: string }>(
      'SELECT name FROM sqlite_master WHERE type = \'table\' AND name = \'legacy_notes\'',
    )).resolves.toBeUndefined()
    await expect(current.get<{ user_version: number }>('PRAGMA user_version')).resolves.toEqual({
      user_version: mainDatabaseSchemaGeneration,
    })
    await current.close()
  })

  it('deletes a database from an incompatible generation before opening the current generation', async () => {
    const path = await databasePath()
    const legacy = new BetterSqliteDatabase(path)
    await legacy.exec('CREATE TABLE incompatible_notes (value TEXT NOT NULL)')
    await legacy.run('INSERT INTO incompatible_notes (value) VALUES (?)', ['delete me'])
    await legacy.exec('PRAGMA user_version = 999')
    await legacy.close()

    const current = await openCurrentMainDatabase(path)

    await expect(current.get<{ name: string }>(
      'SELECT name FROM sqlite_master WHERE type = \'table\' AND name = \'incompatible_notes\'',
    )).resolves.toBeUndefined()
    await expect(current.get<{ user_version: number }>('PRAGMA user_version')).resolves.toEqual({
      user_version: mainDatabaseSchemaGeneration,
    })
    await current.close()
  })
})
