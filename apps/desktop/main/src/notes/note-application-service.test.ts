import type { EmbeddingModel } from '@memorilo/editor-storage'
import { createEditorStorage } from '@memorilo/editor-storage'
import { createEditorNote } from '@memorilo/editor/note'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { BetterSqliteDatabase } from '../storage/better-sqlite-database'
import { createNoteApplicationService, NoteApplicationServiceClosedError, NoteRevisionConflictError } from './note-application-service'

const embeddingModel: EmbeddingModel = {
  dimensions: 3,
  id: 'test/mcp-note-service',
  embedDocuments: async texts => texts.map(() => Float32Array.from([1, 0, 0])),
  embedQuery: async () => Float32Array.from([1, 0, 0]),
}

const databases: BetterSqliteDatabase[] = []

async function createFixture() {
  const database = new BetterSqliteDatabase(':memory:')
  databases.push(database)
  const storage = await createEditorStorage({ database, embeddingModel })
  const onExternalUpdate = vi.fn()
  const notes = createNoteApplicationService(storage, onExternalUpdate)
  const created = await notes.createNote({ initialHeading: 'Initial Topic', title: 'MCP Note' })
  const tree = await notes.getNoteTree({ noteId: created.id })
  const topic = tree.entries.find(entry => entry.kind === 'topic')
  if (!topic)
    throw new Error('Created Note is missing its Topic')
  return { created, notes, onExternalUpdate, storage, topic, tree }
}

afterEach(async () => {
  await Promise.all(databases.splice(0).map(database => database.close()))
  vi.restoreAllMocks()
})

describe('application service for MCP Notes', () => {
  it('persists structured edits, updates projections, and broadcasts the exact Loro update', async () => {
    const fixture = await createFixture()
    const before = await fixture.notes.getTopic({ noteId: fixture.created.id, topicId: fixture.topic.id })
    const blockId = before.document.content?.[0]?.attrs?.blockId
    if (typeof blockId !== 'string')
      throw new Error('Initial Topic is missing its Block ID')

    const receipt = await fixture.notes.applyTopicEdits({
      edits: [{
        blockId,
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Edited through MCP' }] }],
        operation: 'update-block-content',
      }],
      expectedRevision: before.revision,
      noteId: fixture.created.id,
      topicId: fixture.topic.id,
    })

    expect(receipt.revision).not.toBe(before.revision)
    expect(fixture.onExternalUpdate).toHaveBeenCalledTimes(1)
    expect(fixture.onExternalUpdate).toHaveBeenCalledWith({
      noteId: fixture.created.id,
      update: expect.any(Uint8Array),
      updatedAt: receipt.updatedAt,
    })
    const emitted = fixture.onExternalUpdate.mock.calls[0]?.[0]
    if (!emitted)
      throw new Error('MCP edit did not emit an external update')
    const rendererNote = createEditorNote({ id: fixture.created.id, snapshot: fixture.created.snapshot })
    rendererNote.importUpdates(emitted.update)
    expect(rendererNote.getTopicValidationInput(fixture.topic.id).document.content?.[0]?.content?.[0]?.content?.[0]?.text).toBe('Edited through MCP')

    const projected = await fixture.storage.getTopicBlock({ blockId, noteId: fixture.created.id, topicId: fixture.topic.id })
    expect(projected?.text).toBe('Edited through MCP')

    const restoredService = createNoteApplicationService(fixture.storage)
    const restored = await restoredService.getTopic({ noteId: fixture.created.id, topicId: fixture.topic.id })
    expect(restored.revision).toBe(receipt.revision)
    expect(restored.document.content?.[0]?.content?.[0]?.content?.[0]?.text).toBe('Edited through MCP')
  })

  it('does not report a persisted edit as failed when renderer notification throws', async () => {
    const fixture = await createFixture()
    const before = await fixture.notes.getTopic({ noteId: fixture.created.id, topicId: fixture.topic.id })
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    fixture.onExternalUpdate.mockImplementationOnce(() => {
      throw new Error('renderer destroyed')
    })

    const receipt = await fixture.notes.renameTopic({
      expectedRevision: before.revision,
      noteId: fixture.created.id,
      title: 'Persisted despite notification failure',
      topicId: fixture.topic.id,
    })

    expect(receipt.revision).not.toBe(before.revision)
    const restored = await createNoteApplicationService(fixture.storage).getTopic({ noteId: fixture.created.id, topicId: fixture.topic.id })
    expect(restored.title).toBe('Persisted despite notification failure')
  })

  it('rejects stale revisions before mutation and reports the current revision', async () => {
    const fixture = await createFixture()
    const renamed = await fixture.notes.renameTopic({
      expectedRevision: fixture.tree.revision,
      noteId: fixture.created.id,
      title: 'Renamed Topic',
      topicId: fixture.topic.id,
    })

    await expect(fixture.notes.setTopicMode({
      expectedRevision: fixture.tree.revision,
      mode: 1,
      noteId: fixture.created.id,
      topicId: fixture.topic.id,
    })).rejects.toEqual(expect.objectContaining<Partial<NoteRevisionConflictError>>({
      currentRevision: renamed.revision,
      name: 'NoteRevisionConflictError',
    }))
    const topic = await fixture.notes.getTopic({ noteId: fixture.created.id, topicId: fixture.topic.id })
    expect(topic.title).toBe('Renamed Topic')
    expect(topic.mode).toBe(0)
    expect(fixture.onExternalUpdate).toHaveBeenCalledTimes(1)
  })

  it('reloads the durable state after persistence rejects a CRDT mutation', async () => {
    const fixture = await createFixture()
    const before = await fixture.notes.getTopic({ noteId: fixture.created.id, topicId: fixture.topic.id })
    vi.spyOn(fixture.storage, 'saveNoteUpdates').mockRejectedValueOnce(new Error('disk full'))

    await expect(fixture.notes.renameTopic({
      expectedRevision: before.revision,
      noteId: fixture.created.id,
      title: 'Must not persist',
      topicId: fixture.topic.id,
    })).rejects.toThrow('disk full')

    const reloaded = await fixture.notes.getTopic({ noteId: fixture.created.id, topicId: fixture.topic.id })
    expect(reloaded.title).toBe(before.title)
    expect(reloaded.revision).toBe(before.revision)
    expect(fixture.onExternalUpdate).not.toHaveBeenCalled()
  })

  it('waits for queued persistence and indexing work before closing', async () => {
    const fixture = await createFixture()
    const before = await fixture.notes.getTopic({ noteId: fixture.created.id, topicId: fixture.topic.id })
    let releaseSave: (() => void) | undefined
    const originalSave = fixture.storage.saveNoteUpdates.bind(fixture.storage)
    vi.spyOn(fixture.storage, 'saveNoteUpdates').mockImplementationOnce(async (input) => {
      await new Promise<void>((resolve) => {
        releaseSave = resolve
      })
      return originalSave(input)
    })

    const rename = fixture.notes.renameTopic({
      expectedRevision: before.revision,
      noteId: fixture.created.id,
      title: 'Drained before close',
      topicId: fixture.topic.id,
    })
    await vi.waitFor(() => expect(releaseSave).toBeTypeOf('function'))
    let closed = false
    const close = fixture.notes.close().then(() => {
      closed = true
    })
    await Promise.resolve()
    expect(closed).toBe(false)

    releaseSave?.()
    await Promise.all([rename, close])
    expect(closed).toBe(true)
  })

  it('serializes concurrent writes so only one request with the same revision commits', async () => {
    const fixture = await createFixture()
    const results = await Promise.allSettled([
      fixture.notes.renameTopic({
        expectedRevision: fixture.tree.revision,
        noteId: fixture.created.id,
        title: 'First',
        topicId: fixture.topic.id,
      }),
      fixture.notes.renameTopic({
        expectedRevision: fixture.tree.revision,
        noteId: fixture.created.id,
        title: 'Second',
        topicId: fixture.topic.id,
      }),
    ])

    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1)
    const rejected = results.find(result => result.status === 'rejected')
    expect(rejected && rejected.status === 'rejected' ? rejected.reason : undefined).toBeInstanceOf(NoteRevisionConflictError)
    expect(fixture.onExternalUpdate).toHaveBeenCalledTimes(1)
  })

  it('checkpoints exactly at 32 durable updates and does not checkpoint at 31', async () => {
    const fixture = await createFixture()
    const checkpoint = vi.spyOn(fixture.storage, 'checkpointNote')
    const renderer = createEditorNote({ id: fixture.created.id, snapshot: fixture.created.snapshot })

    for (let index = 1; index <= 31; index += 1) {
      const version = renderer.getVersion()
      renderer.renameEntry(fixture.topic.id, `Topic ${index}`)
      await fixture.notes.saveNoteUpdates({
        noteId: fixture.created.id,
        updates: [renderer.exportUpdates(version)],
      })
    }
    expect(checkpoint).not.toHaveBeenCalled()

    const version = renderer.getVersion()
    renderer.renameEntry(fixture.topic.id, 'Topic 32')
    await fixture.notes.saveNoteUpdates({
      noteId: fixture.created.id,
      updates: [renderer.exportUpdates(version)],
    })

    expect(checkpoint).toHaveBeenCalledOnce()
    expect(checkpoint).toHaveBeenCalledWith(expect.objectContaining({
      noteId: fixture.created.id,
      throughSequence: 33,
    }))
    const stored = await fixture.storage.getNote({ noteId: fixture.created.id })
    expect(stored.checkpointSequence).toBe(stored.latestSequence)
    expect(stored.updates).toEqual([])
  })

  it('evicts and checkpoints the least recently used dirty Note after access refresh', async () => {
    const fixture = await createFixture()
    const created = [fixture.created]
    for (let index = 1; index < 65; index += 1)
      created.push(await fixture.notes.createNote({ title: `LRU Note ${index}` }))
    const checkpoint = vi.spyOn(fixture.storage, 'checkpointNote')

    await fixture.notes.renameNote({ noteId: created[0]!.id, title: 'Recently used' })
    await fixture.notes.renameNote({ noteId: created[1]!.id, title: 'Least recently used and dirty' })
    for (const note of created.slice(2, 64))
      await fixture.notes.getNote({ noteId: note.id })
    await fixture.notes.getNote({ noteId: created[0]!.id })
    checkpoint.mockClear()

    await fixture.notes.getNote({ noteId: created[64]!.id })

    expect(checkpoint).toHaveBeenCalledOnce()
    expect(checkpoint).toHaveBeenCalledWith(expect.objectContaining({ noteId: created[1]!.id }))
    const restored = await createNoteApplicationService(fixture.storage).getNote({ noteId: created[1]!.id })
    expect(restored.title).toBe('Least recently used and dirty')
  })

  it('recovers an evicted Note from the update log when its checkpoint fails', async () => {
    const fixture = await createFixture()
    await fixture.notes.renameNote({ noteId: fixture.created.id, title: 'Durable update log title' })
    for (let index = 1; index < 64; index += 1)
      await fixture.notes.createNote({ title: `Cache filler ${index}` })
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const originalCheckpoint = fixture.storage.checkpointNote.bind(fixture.storage)
    let failed = false
    vi.spyOn(fixture.storage, 'checkpointNote').mockImplementation(async (input) => {
      if (!failed && input.noteId === fixture.created.id) {
        failed = true
        throw new Error('checkpoint unavailable')
      }
      return originalCheckpoint(input)
    })

    await fixture.notes.createNote({ title: 'Evict oldest' })

    const restored = await createNoteApplicationService(fixture.storage).getNote({ noteId: fixture.created.id })
    expect(restored.title).toBe('Durable update log title')
  })

  it('broadcasts duplicate updates only once within one renderer batch', async () => {
    const fixture = await createFixture()
    const renderer = createEditorNote({ id: fixture.created.id, snapshot: fixture.created.snapshot })
    const version = renderer.getVersion()
    renderer.renameEntry(fixture.topic.id, 'One accepted update')
    const update = renderer.exportUpdates(version)
    fixture.onExternalUpdate.mockClear()

    await fixture.notes.saveNoteUpdates({ noteId: fixture.created.id, updates: [update, update] })

    expect(fixture.onExternalUpdate).toHaveBeenCalledOnce()
  })

  it('does not rebroadcast or reindex duplicate renderer retries', async () => {
    const fixture = await createFixture()
    await fixture.notes.close()
    const onExternalUpdate = vi.fn()
    const service = createNoteApplicationService(fixture.storage, onExternalUpdate)
    const renderer = createEditorNote({ id: fixture.created.id, snapshot: fixture.created.snapshot })
    const version = renderer.getVersion()
    renderer.renameEntry(fixture.topic.id, 'One durable update')
    const update = renderer.exportUpdates(version)
    const index = vi.spyOn(fixture.storage, 'indexPendingEmbeddings')

    await service.saveNoteUpdates({ noteId: fixture.created.id, updates: [update] })
    await service.saveNoteUpdates({ noteId: fixture.created.id, updates: [update] })
    await service.close()

    expect(onExternalUpdate).toHaveBeenCalledOnce()
    expect(index).toHaveBeenCalledOnce()
    const stored = await fixture.storage.getNote({ noteId: fixture.created.id })
    expect(stored.latestSequence - stored.checkpointSequence).toBe(0)
  })

  it('makes close idempotent, drains admitted work, and rejects later operations', async () => {
    const fixture = await createFixture()
    const before = await fixture.notes.getTopic({ noteId: fixture.created.id, topicId: fixture.topic.id })
    let releaseSave: (() => void) | undefined
    const originalSave = fixture.storage.saveNoteUpdates.bind(fixture.storage)
    vi.spyOn(fixture.storage, 'saveNoteUpdates').mockImplementationOnce(async (input) => {
      await new Promise<void>((resolve) => {
        releaseSave = resolve
      })
      return originalSave(input)
    })
    const admitted = fixture.notes.renameTopic({
      expectedRevision: before.revision,
      noteId: fixture.created.id,
      title: 'Admitted before close',
      topicId: fixture.topic.id,
    })
    await vi.waitFor(() => expect(releaseSave).toBeTypeOf('function'))

    const firstClose = fixture.notes.close()
    const secondClose = fixture.notes.close()
    expect(secondClose).toBe(firstClose)
    await expect(fixture.notes.getNote({ noteId: fixture.created.id })).rejects.toBeInstanceOf(NoteApplicationServiceClosedError)
    releaseSave?.()
    await Promise.all([admitted, firstClose])

    const restored = await createNoteApplicationService(fixture.storage).getTopic({
      noteId: fixture.created.id,
      topicId: fixture.topic.id,
    })
    expect(restored.title).toBe('Admitted before close')
  })
})
