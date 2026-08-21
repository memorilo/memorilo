import type { SyncChange, VersionVector } from '@memorilo/p2p-sync'
import { Buffer } from 'node:buffer'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { SqliteEditorStorage } from '@memorilo/editor-storage'
import { createEditorNote } from '@memorilo/editor/note'
import { JsonSyncJournal, MemoryPairingStore, PairingManager } from '@memorilo/p2p-sync'
import { createP2pNode } from '@memorilo/p2p-sync/node'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { BetterSqliteDatabase } from '../storage/better-sqlite-database'
import { createNoteApplicationService } from './note-application-service'

const embeddingModel = {
  dimensions: 3,
  id: 'test/p2p-note-sync',
  embedDocuments: async (texts: readonly string[]) => texts.map(() => Float32Array.from([1, 0, 0])),
  embedQuery: async () => Float32Array.from([1, 0, 0]),
}

describe('p2p Note synchronization', () => {
  const handles: Array<{ close: () => Promise<void> }> = []
  const applications: Array<{ close: () => Promise<void> }> = []
  const storages: Array<Awaited<ReturnType<typeof SqliteEditorStorage.open>>> = []
  const databases: BetterSqliteDatabase[] = []
  const temporaryDirectories: string[] = []

  async function waitFor(predicate: () => boolean, timeoutMs = 2_000): Promise<void> {
    const deadline = Date.now() + timeoutMs
    while (!predicate() && Date.now() < deadline)
      await new Promise(resolve => setTimeout(resolve, 10))
    if (!predicate())
      throw new Error('Timed out waiting for P2P Note synchronization')
  }

  async function openStorage(): Promise<Awaited<ReturnType<typeof SqliteEditorStorage.open>>> {
    const database = new BetterSqliteDatabase(':memory:')
    databases.push(database)
    const storage = await SqliteEditorStorage.open({ database, databaseOwnership: 'owned', embeddingModel })
    storages.push(storage)
    return storage
  }

  afterEach(async () => {
    await Promise.all(handles.splice(0).map(handle => handle.close()))
    await Promise.all(applications.splice(0).map(application => application.close()))
    await Promise.all(storages.splice(0).map(storage => storage.close()))
    await Promise.all(databases.splice(0).map(database => database.close()))
    await Promise.all(temporaryDirectories.splice(0).map(directory => rm(directory, { force: true, recursive: true })))
    vi.restoreAllMocks()
  })

  it('creates and updates a missing Note received from a peer', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'memorilo-note-p2p-sync-'))
    temporaryDirectories.push(directory)
    const sourceJournal = new JsonSyncJournal(join(directory, 'source-journal.json'))
    const destinationJournal = new JsonSyncJournal(join(directory, 'destination-journal.json'))
    await sourceJournal.load()
    await destinationJournal.load()
    await sourceJournal.setDeviceId('source')
    await destinationJournal.setDeviceId('destination')

    const sourceStorage = await openStorage()
    const destinationStorage = await openStorage()
    const sourceJournalWrites: Promise<void>[] = []
    const sourceNotes = createNoteApplicationService(sourceStorage, ({ noteId, update }) => {
      sourceJournalWrites.push(sourceJournal.appendLocal({
        id: `note:${noteId}:${Buffer.from(update).toString('base64url')}`,
        kind: 'note-update',
        payload: JSON.stringify({ noteId, update: Buffer.from(update).toString('base64url') }),
      }).then(() => undefined))
    })
    const destinationNotes = createNoteApplicationService(destinationStorage)
    applications.push(sourceNotes, destinationNotes)

    const destinationLoad = vi.spyOn(destinationStorage.notes, 'getNote')
    let receivedNote = false
    const sourcePairing = new PairingManager(
      { deviceId: 'source', deviceName: 'Source', peerId: '' },
      new MemoryPairingStore(),
    )
    const destinationPairing = new PairingManager(
      { deviceId: 'destination', deviceName: 'Destination', peerId: '' },
      new MemoryPairingStore(),
    )
    await sourcePairing.load()
    await destinationPairing.load()
    const source = await createP2pNode({
      identity: sourcePairing.identity,
      listenAddresses: ['/ip4/127.0.0.1/tcp/0'],
      pairing: sourcePairing,
      provider: {
        applyChanges: async () => undefined,
        getChanges: async (since: VersionVector) => sourceJournal.listChanges(since),
        getMembershipEpoch: () => 1,
        getVersionVector: () => sourceJournal.getVersionVector(),
      },
    })
    const destination = await createP2pNode({
      identity: destinationPairing.identity,
      listenAddresses: ['/ip4/127.0.0.1/tcp/0'],
      pairing: destinationPairing,
      provider: {
        applyChanges: async (changes: readonly SyncChange[]) => {
          for (const change of changes) {
            if (change.kind !== 'note-update')
              continue
            const payload = JSON.parse(change.payload) as { noteId: string, update: string }
            await destinationNotes.saveNoteUpdates({
              noteId: payload.noteId,
              updates: [Uint8Array.from(Buffer.from(payload.update, 'base64url'))],
            })
            receivedNote = true
          }
          await destinationJournal.recordReceived(changes)
        },
        getChanges: async (since: VersionVector) => destinationJournal.listChanges(since),
        getMembershipEpoch: () => 1,
        getVersionVector: () => destinationJournal.getVersionVector(),
      },
    })
    handles.push(source, destination)
    const sourcePeerId = source.status().peerId
    const destinationPeerId = destination.status().peerId
    if (sourcePeerId === null || destinationPeerId === null)
      throw new Error('P2P peers did not start')
    sourcePairing.identity.peerId = sourcePeerId
    destinationPairing.identity.peerId = destinationPeerId
    const accepted = await destinationPairing.acceptInvitation(sourcePairing.createInvitation())
    await sourcePairing.completeInvitation(accepted.response)

    const destinationAddress = destination.node.getMultiaddrs()[0]
    if (destinationAddress === undefined)
      throw new Error('Destination peer did not expose a listen address')
    await source.node.dial(destinationAddress as never)
    await source.syncPeer(destinationPeerId)
    const created = await sourceNotes.createNote({ initialHeading: 'Initial heading', title: 'P2P Note' })
    const baseline = createEditorNote({ id: created.id, snapshot: created.snapshot })
    const entries = baseline.getEntries()
    const before = await sourceNotes.getTopic({ noteId: created.id, topicId: entries.find(entry => entry.kind === 'topic')?.id ?? '' })
    const topicId = before.topicId
    const blockId = before.document.content?.[0]?.attrs?.blockId
    if (typeof blockId !== 'string')
      throw new Error('Initial Topic is missing its Block ID')
    await sourceNotes.applyTopicEdits({
      edits: [{
        blockId,
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Received while unopened' }] }],
        operation: 'update-block-content',
      }],
      expectedRevision: before.revision,
      noteId: created.id,
      topicId,
    })
    await Promise.all(sourceJournalWrites)

    await source.notifyChangesAvailable()
    await waitFor(() => receivedNote)

    expect(destinationLoad).toHaveBeenCalledWith({ noteId: created.id })
    await destinationNotes.close()
    applications.splice(applications.indexOf(destinationNotes), 1)
    const reopenedDestinationNotes = createNoteApplicationService(destinationStorage)
    applications.push(reopenedDestinationNotes)
    const restoredNote = await reopenedDestinationNotes.getNote({ noteId: created.id })
    expect(restoredNote.title).toBe('P2P Note')
    const restored = await reopenedDestinationNotes.getTopic({ noteId: created.id, topicId })
    expect(restored.document.content?.[0]?.content?.[0]?.content?.[0]?.text).toBe('Received while unopened')
  })
})
