import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { JsonSyncJournal } from './journal'

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map(directory => rm(directory, { force: true, recursive: true })))
})

describe('durable sync journal', () => {
  it('persists local changes and only advances remote vectors contiguously', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'memorilo-p2p-journal-'))
    temporaryDirectories.push(directory)
    const path = join(directory, 'sync.json')
    const journal = new JsonSyncJournal(path)
    await journal.load()
    await journal.setDeviceId('local')
    await journal.appendLocal({ id: 'local-change', kind: 'note-update', payload: '{}' })

    await journal.recordReceived([{ deviceId: 'remote', id: 'remote-2', kind: 'learning-mutation', payload: '{}', sequence: 2 }])
    expect(journal.getVersionVector()).toEqual({ local: 1 })
    await journal.recordReceived([{ deviceId: 'remote', id: 'remote-1', kind: 'learning-mutation', payload: '{}', sequence: 1 }])
    expect(journal.getVersionVector()).toEqual({ local: 1, remote: 2 })

    const reopened = new JsonSyncJournal(path)
    await reopened.load()
    expect(reopened.deviceId).toBe('local')
    expect(reopened.listChanges({})).toEqual([
      {
        deviceId: 'local',
        id: 'local-change',
        kind: 'note-update',
        payload: '{}',
        sequence: 1,
      },
      {
        deviceId: 'remote',
        id: 'remote-1',
        kind: 'learning-mutation',
        payload: '{}',
        sequence: 1,
      },
      {
        deviceId: 'remote',
        id: 'remote-2',
        kind: 'learning-mutation',
        payload: '{}',
        sequence: 2,
      },
    ])
    expect(reopened.getVersionVector()).toEqual({ local: 1, remote: 2 })
  })
})
