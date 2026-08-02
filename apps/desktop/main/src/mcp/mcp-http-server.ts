import type { DesktopMcpConfiguration } from '@memorilo/desktop-config'
import type { TopicBlockEdit } from '@memorilo/editor/note'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { NoteApplicationService } from '../notes/note-application-service'
import { Buffer } from 'node:buffer'
import { timingSafeEqual } from 'node:crypto'
import { createServer } from 'node:http'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import * as z from 'zod/v4'
import { NoteRevisionConflictError } from '../notes/note-application-service'

const maximumRequestBytes = 1024 * 1024
const endpointPath = '/mcp'
const revisionSchema = z.string().regex(/^[0-9a-f]{64}$/u, 'Revision must be a 64-character lowercase hexadecimal SHA-256 token')

class McpHttpRequestError extends Error {
  constructor(
    readonly status: number,
    readonly rpcCode: number,
    message: string,
  ) {
    super(message)
  }
}

const attributesSchema = z.record(z.string(), z.unknown())
const markSchema = z.object({
  attrs: attributesSchema.optional(),
  type: z.enum(['bold', 'cloze', 'code', 'inlineHighlight', 'italic', 'link', 'strike', 'underline']),
})
const nodeSchema: z.ZodType<{
  attrs?: Record<string, unknown>
  content?: unknown[]
  marks?: Array<{ attrs?: Record<string, unknown>, type: string }>
  text?: string
  type: string
}> = z.lazy(() => z.object({
  attrs: attributesSchema.optional(),
  content: z.array(nodeSchema).optional(),
  marks: z.array(markSchema).optional(),
  text: z.string().optional(),
  type: z.enum([
    'blockquote',
    'cardDelimiter',
    'codeBlock',
    'hardBreak',
    'heading',
    'horizontalRule',
    'image',
    'list',
    'mathBlock',
    'mathInline',
    'paragraph',
    'table',
    'tableCell',
    'tableHeaderCell',
    'tableRow',
    'tag',
    'text',
  ]),
}))

const topicBlockEditSchema = z.discriminatedUnion('operation', [
  z.object({
    attributes: attributesSchema.optional(),
    blockId: z.string().min(1).optional(),
    content: z.array(nodeSchema),
    index: z.number().int().min(0).optional(),
    kind: z.string().min(1),
    operation: z.literal('insert-block'),
    parentId: z.string().min(1).nullable().optional(),
  }),
  z.object({
    blockId: z.string().min(1),
    content: z.array(nodeSchema),
    operation: z.literal('update-block-content'),
  }),
  z.object({
    attributes: attributesSchema,
    blockId: z.string().min(1),
    operation: z.literal('update-block-attributes'),
  }),
  z.object({
    blockId: z.string().min(1),
    index: z.number().int().min(0).optional(),
    operation: z.literal('move-block'),
    parentId: z.string().min(1).nullable().optional(),
  }),
  z.object({
    blockId: z.string().min(1),
    operation: z.literal('delete-block'),
    strategy: z.enum(['delete-subtree', 'promote-children']),
  }),
])

function toolResult(value: unknown) {
  return {
    content: [{ text: JSON.stringify(value, null, 2), type: 'text' as const }],
    structuredContent: value as Record<string, unknown>,
  }
}

function toolError(error: unknown) {
  const value = error instanceof NoteRevisionConflictError
    ? { code: 'revision-conflict', currentRevision: error.currentRevision, message: error.message }
    : { code: 'operation-failed', message: error instanceof Error ? error.message : String(error) }
  return {
    content: [{ text: JSON.stringify(value, null, 2), type: 'text' as const }],
    isError: true,
    structuredContent: value,
  }
}

async function executeTool(operation: () => Promise<unknown>) {
  try {
    return toolResult(await operation())
  }
  catch (error) {
    return toolError(error)
  }
}

function createProtocolServer(notes: NoteApplicationService): McpServer {
  const server = new McpServer({ name: 'memorilo', version: '0.1.0' })

  server.registerTool('list_notes', {
    description: 'List Memorilo Notes with pagination.',
    inputSchema: {
      page: z.number().int().min(1).optional(),
      pageSize: z.number().int().min(1).max(100).optional(),
      sortBy: z.enum(['createdAt', 'title', 'updatedAt']).optional(),
      sortDirection: z.enum(['asc', 'desc']).optional(),
    },
  }, input => executeTool(() => notes.listNotes(input)))

  server.registerTool('list_topics', {
    description: 'List Topics and Folder/Topic positions. When noteId is omitted, scans one page of Notes.',
    inputSchema: {
      noteId: z.string().min(1).optional(),
      page: z.number().int().min(1).optional(),
      pageSize: z.number().int().min(1).max(100).optional(),
    },
  }, ({ noteId, page, pageSize }) => executeTool(async () => {
    const noteIds = noteId
      ? [noteId]
      : (await notes.listNotes({ page, pageSize, sortBy: 'updatedAt', sortDirection: 'desc' })).items.map(note => note.id)
    const trees = await Promise.all(noteIds.map(id => notes.getNoteTree({ noteId: id })))
    return {
      notes: trees.map(tree => ({
        entries: tree.entries,
        noteId: tree.noteId,
        noteTitle: tree.title,
        revision: tree.revision,
      })),
    }
  }))

  server.registerTool('get_note_tree', {
    description: 'Get the complete Folder and Topic hierarchy for one Memorilo Note.',
    inputSchema: { noteId: z.string().min(1) },
  }, input => executeTool(() => notes.getNoteTree(input)))

  server.registerTool('get_topic', {
    description: 'Get one Topic as a structured ProseMirror Block document. Preserve blockId values when editing.',
    inputSchema: { noteId: z.string().min(1), topicId: z.string().min(1) },
  }, input => executeTool(() => notes.getTopic(input)))

  server.registerTool('search_notes', {
    description: 'Search Note titles and Topic content.',
    inputSchema: { limit: z.number().int().min(1).max(100).optional(), query: z.string().min(1) },
  }, input => executeTool(async () => ({ hits: await notes.searchNotes(input) })))

  server.registerTool('apply_topic_edits', {
    description: 'Atomically apply structural Block edits to one Topic. Read the Topic first and pass its revision.',
    inputSchema: {
      edits: z.array(topicBlockEditSchema).min(1).max(100),
      expectedRevision: revisionSchema,
      noteId: z.string().min(1),
      topicId: z.string().min(1),
    },
  }, input => executeTool(() => notes.applyTopicEdits({ ...input, edits: input.edits as readonly TopicBlockEdit[] })))

  server.registerTool('set_topic_mode', {
    description: 'Set a Topic editor mode: 0 for Document or 1 for Outline. Read the Topic first and pass its revision.',
    inputSchema: {
      expectedRevision: revisionSchema,
      mode: z.union([z.literal(0), z.literal(1)]),
      noteId: z.string().min(1),
      topicId: z.string().min(1),
    },
  }, input => executeTool(() => notes.setTopicMode(input)))

  server.registerTool('rename_topic', {
    description: 'Rename one Topic. Read the Note tree or Topic first and pass its revision.',
    inputSchema: {
      expectedRevision: revisionSchema,
      noteId: z.string().min(1),
      title: z.string(),
      topicId: z.string().min(1),
    },
  }, input => executeTool(() => notes.renameTopic(input)))

  return server
}

function jsonRpcError(response: ServerResponse, status: number, code: number, message: string): void {
  response.writeHead(status, { 'content-type': 'application/json' })
  response.end(JSON.stringify({ error: { code, message }, id: null, jsonrpc: '2.0' }))
}

function isAuthorized(request: IncomingMessage, accessToken: string): boolean {
  const authorization = request.headers.authorization
  if (!authorization?.startsWith('Bearer '))
    return false
  const supplied = Buffer.from(authorization.slice('Bearer '.length), 'utf8')
  const expected = Buffer.from(accessToken, 'utf8')
  return supplied.length === expected.length && timingSafeEqual(supplied, expected)
}

function isAllowedHost(request: IncomingMessage, port: number): boolean {
  return request.headers.host === `127.0.0.1:${port}` || request.headers.host === `localhost:${port}`
}

function isAllowedOrigin(request: IncomingMessage, port: number): boolean {
  const origin = request.headers.origin
  return origin === undefined || origin === `http://127.0.0.1:${port}` || origin === `http://localhost:${port}`
}

async function readJson(request: IncomingMessage): Promise<unknown> {
  const contentType = request.headers['content-type']?.split(';', 1)[0]?.trim().toLowerCase()
  if (contentType !== 'application/json')
    throw new McpHttpRequestError(415, -32000, 'Content-Type must be application/json')

  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += buffer.byteLength
    if (size > maximumRequestBytes)
      throw new McpHttpRequestError(413, -32000, 'MCP request body exceeds 1 MiB')
    chunks.push(buffer)
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown
  }
  catch {
    throw new McpHttpRequestError(400, -32700, 'Parse error')
  }
}

export async function startMcpHttpServer(
  configuration: DesktopMcpConfiguration,
  notes: NoteApplicationService,
): Promise<() => Promise<void>> {
  if (configuration.accessToken.length < 32)
    throw new TypeError('MCP access token must contain at least 32 characters')

  const activeCleanups = new Set<Promise<unknown>>()
  const httpServer = createServer(async (request, response) => {
    try {
      if (new URL(request.url ?? '/', `http://127.0.0.1:${configuration.port}`).pathname !== endpointPath) {
        response.writeHead(404).end()
        return
      }
      if (!isAllowedHost(request, configuration.port) || !isAllowedOrigin(request, configuration.port)) {
        response.writeHead(403).end()
        return
      }
      if (!isAuthorized(request, configuration.accessToken)) {
        response.writeHead(401, { 'www-authenticate': 'Bearer' }).end()
        return
      }
      if (request.method !== 'POST') {
        jsonRpcError(response, 405, -32000, 'Method not allowed')
        return
      }

      const body = await readJson(request)
      const protocolServer = createProtocolServer(notes)
      const transport = new StreamableHTTPServerTransport({
        enableJsonResponse: true,
        sessionIdGenerator: undefined,
      })
      let cleanup: Promise<unknown> | undefined
      const closeProtocol = () => {
        if (cleanup)
          return cleanup
        cleanup = Promise.allSettled([transport.close(), protocolServer.close()])
        activeCleanups.add(cleanup)
        void cleanup.finally(() => activeCleanups.delete(cleanup as Promise<unknown>))
        return cleanup
      }
      response.once('close', () => void closeProtocol())
      try {
        await protocolServer.connect(transport)
        await transport.handleRequest(request, response, body)
      }
      catch (error) {
        await closeProtocol()
        throw error
      }
    }
    catch (error) {
      if (!(error instanceof McpHttpRequestError))
        console.error('Failed to handle MCP request', error)
      if (!response.headersSent) {
        const failure = error instanceof McpHttpRequestError
          ? error
          : new McpHttpRequestError(500, -32603, 'Internal server error')
        jsonRpcError(response, failure.status, failure.rpcCode, failure.message)
      }
    }
  })
  httpServer.requestTimeout = 30_000
  httpServer.headersTimeout = 15_000

  await new Promise<void>((resolve, reject) => {
    httpServer.once('error', reject)
    httpServer.listen(configuration.port, '127.0.0.1', () => {
      httpServer.off('error', reject)
      resolve()
    })
  })
  let closing: Promise<void> | undefined
  return () => {
    closing ??= new Promise<void>((resolve, reject) => {
      httpServer.close(error => error ? reject(error) : resolve())
    }).then(async () => {
      await Promise.allSettled([...activeCleanups])
    })
    return closing
  }
}
