import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { SqliteEditorStorage } from './editor-storage'
import { SqliteTestDatabase } from './sqlite-test-database'

const temporaryDirectories: string[] = []

const embeddingModel = {
  dimensions: 3,
  id: 'test/three-dimensional',
  embedDocuments: async (texts: readonly string[]) => texts.map(() => Float32Array.from([1, 0, 0])),
  embedQuery: async () => Float32Array.from([1, 0, 0]),
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(directory => (
    rm(directory, { force: true, recursive: true })
  )))
})

describe('user document storage', () => {
  it('persists an owned snapshot across storage instances', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'memorilo-user-document-'))
    temporaryDirectories.push(directory)
    const databasePath = join(directory, 'memorilo.sqlite')
    const documentId = 'whiteboard-library'
    const snapshot = Uint8Array.from([11, 22, 33, 44])

    const first = await SqliteEditorStorage.open({
      database: new SqliteTestDatabase(databasePath),
      databaseOwnership: 'owned',
      embeddingModel,
    })
    await expect(first.userDocuments.load(documentId)).resolves.toBeNull()
    await first.userDocuments.save({ documentId, snapshot })
    snapshot[0] = 99
    const firstRead = await first.userDocuments.load(documentId)
    expect(firstRead).toEqual(Uint8Array.from([11, 22, 33, 44]))
    firstRead![1] = 88
    await first.close()

    const second = await SqliteEditorStorage.open({
      database: new SqliteTestDatabase(databasePath),
      databaseOwnership: 'owned',
      embeddingModel,
    })
    await expect(second.userDocuments.load(documentId)).resolves.toEqual(
      Uint8Array.from([11, 22, 33, 44]),
    )
    await second.close()
  })

  it('rejects empty document identities and snapshots', async () => {
    const storage = await SqliteEditorStorage.open({
      database: new SqliteTestDatabase(),
      databaseOwnership: 'owned',
      embeddingModel,
    })
    try {
      expect(() => storage.userDocuments.load('')).toThrow('User document id must not be empty')
      expect(() => storage.userDocuments.save({
        documentId: 'whiteboard-library',
        snapshot: new Uint8Array(),
      })).toThrow('User document snapshot must be a non-empty Uint8Array')
    }
    finally {
      await storage.close()
    }
  })
})
