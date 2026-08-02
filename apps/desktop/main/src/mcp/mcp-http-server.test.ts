import type { EditorStorage, EmbeddingModel } from '@memorilo/editor-storage'
import type { AddressInfo } from 'node:net'
import type { NoteApplicationService } from '../notes/note-application-service'
import { request as httpRequest } from 'node:http'
import { createServer } from 'node:net'
import { createEditorStorage } from '@memorilo/editor-storage'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createNoteApplicationService, NoteRevisionConflictError } from '../notes/note-application-service'
import { BetterSqliteDatabase } from '../storage/better-sqlite-database'
import { startMcpHttpServer } from './mcp-http-server'

const accessToken = '0123456789abcdef0123456789abcdef'
const revision = 'a'.repeat(64)
const stops: Array<() => Promise<void>> = []
const storages: EditorStorage[] = []
const embeddingModel: EmbeddingModel = {
  dimensions: 3,
  id: 'test/mcp-http',
  embedDocuments: async texts => texts.map(() => Float32Array.from([1, 0, 0])),
  embedQuery: async () => Float32Array.from([1, 0, 0]),
}

async function unusedPort(): Promise<number> {
  const server = createServer()
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const address = server.address() as AddressInfo
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
  return address.port
}

function createNotesStub() {
  const tree = {
    entries: [{ id: 'topic-1', kind: 'topic' as const, mode: 0 as const, ordinal: 0, parentId: null, title: 'Topic' }],
    noteId: 'note-1',
    revision,
    title: 'Note',
    updatedAt: 10,
  }
  const notes = {
    applyTopicEdits: vi.fn(async () => ({ revision: 'b'.repeat(64), updatedAt: 20 })),
    getNoteTree: vi.fn(async () => tree),
    getTopic: vi.fn(async () => ({
      document: { content: [], type: 'doc' },
      mode: 0,
      noteId: 'note-1',
      revision,
      title: 'Topic',
      topicId: 'topic-1',
      updatedAt: 10,
    })),
    listNotes: vi.fn(async () => ({
      items: [{ createdAt: 1, favorite: false, id: 'note-1', title: 'Note', updatedAt: 10 }],
      page: 1,
      pageSize: 50,
      totalItems: 1,
      totalPages: 1,
    })),
    renameTopic: vi.fn(async () => ({ revision: 'c'.repeat(64), updatedAt: 30 })),
    searchNotes: vi.fn(async () => [{ blockId: 'block-1', noteId: 'note-1', score: 1, snippet: 'match', topicId: 'topic-1' }]),
    setTopicMode: vi.fn(async () => ({ revision: 'd'.repeat(64), updatedAt: 40 })),
  }
  return { notes: notes as unknown as NoteApplicationService, spies: notes }
}

async function start(notes: NoteApplicationService) {
  const port = await unusedPort()
  const stop = await startMcpHttpServer({ accessToken, enabled: true, port }, notes)
  stops.push(stop)
  return { endpoint: `http://127.0.0.1:${port}/mcp`, port }
}

async function request(
  endpoint: string,
  body: unknown,
  options: { authorization?: string, host?: string, method?: string, origin?: string } = {},
): Promise<Response> {
  return fetch(endpoint, {
    body: options.method === 'GET' ? undefined : JSON.stringify(body),
    headers: {
      'accept': 'application/json, text/event-stream',
      'authorization': options.authorization ?? `Bearer ${accessToken}`,
      'content-type': 'application/json',
      ...(options.host ? { host: options.host } : {}),
      ...(options.origin ? { origin: options.origin } : {}),
    },
    method: options.method ?? 'POST',
  })
}

async function rawStatus(endpoint: string, headers: Record<string, string>): Promise<number> {
  const url = new URL(endpoint)
  return new Promise<number>((resolve, reject) => {
    const request = httpRequest({
      headers: {
        'authorization': `Bearer ${accessToken}`,
        'content-type': 'application/json',
        ...headers,
      },
      hostname: url.hostname,
      method: 'POST',
      path: url.pathname,
      port: url.port,
    }, (response) => {
      response.resume()
      response.once('end', () => resolve(response.statusCode ?? 0))
    })
    request.once('error', reject)
    request.end('{}')
  })
}

async function rpc(endpoint: string, method: string, params?: unknown) {
  const response = await request(endpoint, {
    id: 1,
    jsonrpc: '2.0',
    method,
    ...(params === undefined ? {} : { params }),
  })
  expect(response.status).toBe(200)
  return response.json() as Promise<Record<string, any>>
}

async function callTool(endpoint: string, name: string, args: Record<string, unknown>) {
  return rpc(endpoint, 'tools/call', { arguments: args, name })
}

afterEach(async () => {
  await Promise.all(stops.splice(0).map(stop => stop()))
  await Promise.all(storages.splice(0).map(storage => storage.close()))
  vi.restoreAllMocks()
})

describe('streamable HTTP server for MCP', () => {
  it('rejects unsafe requests before invoking the protocol server', async () => {
    const { notes, spies } = createNotesStub()
    const { endpoint, port } = await start(notes)

    expect((await request(endpoint, {}, { authorization: '' })).status).toBe(401)
    expect((await request(endpoint, {}, { authorization: 'Bearer wrong-token' })).status).toBe(401)
    expect(await rawStatus(endpoint, { host: `example.com:${port}` })).toBe(403)
    expect((await request(endpoint, {}, { origin: 'https://example.com' })).status).toBe(403)
    expect((await request(endpoint, {}, { method: 'GET' })).status).toBe(405)
    expect((await request(endpoint.replace('/mcp', '/other'), {})).status).toBe(404)
    expect(spies.listNotes).not.toHaveBeenCalled()
  })

  it('accepts loopback Host and Origin values and exposes all tools after initialization', async () => {
    const { notes } = createNotesStub()
    const { endpoint, port } = await start(notes)
    const initialized = await rpc(endpoint, 'initialize', {
      capabilities: {},
      clientInfo: { name: 'vitest', version: '1.0.0' },
      protocolVersion: '2025-03-26',
    })
    expect(initialized.result.serverInfo).toEqual({ name: 'memorilo', version: '0.1.0' })

    const listed = await rpc(endpoint, 'tools/list')
    expect(listed.result.tools.map((tool: { name: string }) => tool.name).sort()).toEqual([
      'apply_topic_edits',
      'get_note_tree',
      'get_topic',
      'list_notes',
      'list_topics',
      'rename_topic',
      'search_notes',
      'set_topic_mode',
    ])

    const response = await request(endpoint, {
      id: 2,
      jsonrpc: '2.0',
      method: 'tools/list',
    }, { host: `localhost:${port}`, origin: `http://localhost:${port}` })
    expect(response.status).toBe(200)
  })

  it('calls every read and write tool with structured results', async () => {
    const { notes, spies } = createNotesStub()
    const { endpoint } = await start(notes)

    expect((await callTool(endpoint, 'list_notes', { page: 2, pageSize: 25 })).result.structuredContent.items[0].id).toBe('note-1')
    expect((await callTool(endpoint, 'list_topics', { noteId: 'note-1' })).result.structuredContent.notes[0].entries[0].id).toBe('topic-1')
    expect((await callTool(endpoint, 'get_note_tree', { noteId: 'note-1' })).result.structuredContent.revision).toBe(revision)
    expect((await callTool(endpoint, 'get_topic', { noteId: 'note-1', topicId: 'topic-1' })).result.structuredContent.document.type).toBe('doc')
    expect((await callTool(endpoint, 'search_notes', { limit: 5, query: 'match' })).result.structuredContent.hits[0].blockId).toBe('block-1')

    const edits = [{
      blockId: 'block-1',
      content: [{ content: [{ text: 'Updated', type: 'text' }], type: 'paragraph' }],
      operation: 'update-block-content',
    }]
    expect((await callTool(endpoint, 'apply_topic_edits', {
      edits,
      expectedRevision: revision,
      noteId: 'note-1',
      topicId: 'topic-1',
    })).result.structuredContent.updatedAt).toBe(20)
    expect((await callTool(endpoint, 'rename_topic', {
      expectedRevision: revision,
      noteId: 'note-1',
      title: 'Renamed',
      topicId: 'topic-1',
    })).result.structuredContent.updatedAt).toBe(30)
    expect((await callTool(endpoint, 'set_topic_mode', {
      expectedRevision: revision,
      mode: 1,
      noteId: 'note-1',
      topicId: 'topic-1',
    })).result.structuredContent.updatedAt).toBe(40)

    const unscopedTopics = await callTool(endpoint, 'list_topics', { page: 3, pageSize: 10 })
    expect(unscopedTopics.result.structuredContent.notes[0].noteId).toBe('note-1')

    expect(spies.listNotes).toHaveBeenCalledWith({ page: 2, pageSize: 25 })
    expect(spies.listNotes).toHaveBeenCalledWith({ page: 3, pageSize: 10, sortBy: 'updatedAt', sortDirection: 'desc' })
    expect(spies.getNoteTree).toHaveBeenCalledWith({ noteId: 'note-1' })
    expect(spies.getTopic).toHaveBeenCalledWith({ noteId: 'note-1', topicId: 'topic-1' })
    expect(spies.searchNotes).toHaveBeenCalledWith({ limit: 5, query: 'match' })
    expect(spies.applyTopicEdits).toHaveBeenCalledWith({ edits, expectedRevision: revision, noteId: 'note-1', topicId: 'topic-1' })
    expect(spies.renameTopic).toHaveBeenCalledWith({ expectedRevision: revision, noteId: 'note-1', title: 'Renamed', topicId: 'topic-1' })
    expect(spies.setTopicMode).toHaveBeenCalledWith({ expectedRevision: revision, mode: 1, noteId: 'note-1', topicId: 'topic-1' })
  })

  it('persists a real structured edit through HTTP and rejects its stale revision', async () => {
    const storage = await createEditorStorage({
      database: new BetterSqliteDatabase(':memory:'),
      embeddingModel,
    })
    storages.push(storage)
    const notes = createNoteApplicationService(storage)
    const created = await notes.createNote({ initialHeading: 'Initial Topic', title: 'HTTP Integration' })
    const tree = await notes.getNoteTree({ noteId: created.id })
    const topic = tree.entries.find(entry => entry.kind === 'topic')
    if (!topic)
      throw new Error('HTTP integration Note is missing its Topic')
    const { endpoint } = await start(notes)

    const before = await callTool(endpoint, 'get_topic', { noteId: created.id, topicId: topic.id })
    const blockId = before.result.structuredContent.document.content[0].attrs.blockId as string
    const edited = await callTool(endpoint, 'apply_topic_edits', {
      edits: [{
        blockId,
        content: [{ content: [{ text: 'Persisted through HTTP', type: 'text' }], type: 'paragraph' }],
        operation: 'update-block-content',
      }],
      expectedRevision: before.result.structuredContent.revision,
      noteId: created.id,
      topicId: topic.id,
    })
    expect(edited.result.isError).not.toBe(true)

    const after = await callTool(endpoint, 'get_topic', { noteId: created.id, topicId: topic.id })
    expect(after.result.structuredContent.document.content[0].content[0].content[0].text).toBe('Persisted through HTTP')
    expect(after.result.structuredContent.revision).toBe(edited.result.structuredContent.revision)

    const stale = await callTool(endpoint, 'rename_topic', {
      expectedRevision: before.result.structuredContent.revision,
      noteId: created.id,
      title: 'Stale rename',
      topicId: topic.id,
    })
    expect(stale.result).toMatchObject({
      isError: true,
      structuredContent: {
        code: 'revision-conflict',
        currentRevision: edited.result.structuredContent.revision,
      },
    })
  })

  it('maps revision conflicts and all service failures to tool errors', async () => {
    const { notes, spies } = createNotesStub()
    spies.renameTopic.mockRejectedValueOnce(new NoteRevisionConflictError('f'.repeat(64)))
    spies.getTopic.mockRejectedValueOnce(new Error('missing Topic'))
    spies.listNotes.mockRejectedValueOnce(new Error('list unavailable'))
    spies.searchNotes.mockRejectedValueOnce(new Error('search unavailable'))
    const { endpoint } = await start(notes)

    const conflict = await callTool(endpoint, 'rename_topic', {
      expectedRevision: revision,
      noteId: 'note-1',
      title: 'Stale',
      topicId: 'topic-1',
    })
    expect(conflict.result).toMatchObject({
      isError: true,
      structuredContent: { code: 'revision-conflict', currentRevision: 'f'.repeat(64) },
    })

    const failure = await callTool(endpoint, 'get_topic', { noteId: 'note-1', topicId: 'missing' })
    expect(failure.result).toMatchObject({
      isError: true,
      structuredContent: { code: 'operation-failed', message: 'missing Topic' },
    })
    expect((await callTool(endpoint, 'list_notes', {})).result).toMatchObject({
      isError: true,
      structuredContent: { code: 'operation-failed', message: 'list unavailable' },
    })
    expect((await callTool(endpoint, 'search_notes', { query: 'match' })).result).toMatchObject({
      isError: true,
      structuredContent: { code: 'operation-failed', message: 'search unavailable' },
    })
  })

  it('rejects malformed HTTP bodies, invalid tool inputs, and oversized requests', async () => {
    const { notes, spies } = createNotesStub()
    const { endpoint } = await start(notes)
    const invalid = await callTool(endpoint, 'apply_topic_edits', {
      edits: [],
      expectedRevision: 'short',
      noteId: 'note-1',
      topicId: 'topic-1',
    })
    expect(invalid.result.isError).toBe(true)
    expect(spies.applyTopicEdits).not.toHaveBeenCalled()

    const malformed = await fetch(endpoint, {
      body: '{',
      headers: {
        'authorization': `Bearer ${accessToken}`,
        'content-type': 'application/json',
      },
      method: 'POST',
    })
    expect(malformed.status).toBe(400)
    expect(await malformed.json()).toMatchObject({ error: { code: -32700, message: 'Parse error' } })

    const wrongMediaType = await fetch(endpoint, {
      body: '{}',
      headers: {
        'authorization': `Bearer ${accessToken}`,
        'content-type': 'text/plain',
      },
      method: 'POST',
    })
    expect(wrongMediaType.status).toBe(415)

    const oversized = await fetch(endpoint, {
      body: JSON.stringify({ padding: 'x'.repeat(1024 * 1024) }),
      headers: {
        'authorization': `Bearer ${accessToken}`,
        'content-type': 'application/json',
      },
      method: 'POST',
    })
    expect(oversized.status).toBe(413)
  })

  it('refuses short access tokens and occupied ports', async () => {
    const { notes } = createNotesStub()
    await expect(startMcpHttpServer({ accessToken: 'short', enabled: true, port: 8765 }, notes)).rejects.toThrow('at least 32 characters')

    const port = await unusedPort()
    const first = await startMcpHttpServer({ accessToken, enabled: true, port }, notes)
    stops.push(first)
    await expect(startMcpHttpServer({ accessToken, enabled: true, port }, notes)).rejects.toThrow()
  })
})
