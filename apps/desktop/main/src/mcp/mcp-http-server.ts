import type { DesktopMcpConfiguration } from '@memorilo/desktop-config'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { NoteApplicationService } from '../notes/note-application-service'
import { Buffer } from 'node:buffer'
import { timingSafeEqual } from 'node:crypto'
import { createServer } from 'node:http'
import {
  combineLifecycleFailures,
  createOperationSupervisor,
  createResourceScope,
  runLifecycleOperations,
} from '@memorilo/effect-lifecycle'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { createMcpNoteProtocolServer } from './mcp-note-protocol'

const maximumRequestBytes = 1024 * 1024
const endpointPath = '/mcp'
const requestDrainGraceMilliseconds = 1_000

interface McpProtocolConnection {
  close: () => Promise<void>
  connect: () => Promise<void>
  handleRequest: (
    request: IncomingMessage,
    response: ServerResponse,
    body: unknown,
  ) => Promise<void>
  interrupt: () => Promise<void>
}

interface McpHttpServerDependencies {
  createConnection?: (notes: NoteApplicationService) => McpProtocolConnection
}

interface OwnedMcpProtocolConnection {
  close: () => Promise<unknown>
  interrupt: () => Promise<void>
}

class McpHttpRequestError extends Error {
  constructor(
    readonly status: number,
    readonly rpcCode: number,
    message: string,
  ) {
    super(message)
  }
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

function createMcpProtocolConnection(notes: NoteApplicationService): McpProtocolConnection {
  const protocolServer = createMcpNoteProtocolServer(notes)
  const transport = new StreamableHTTPServerTransport({
    enableJsonResponse: true,
    sessionIdGenerator: undefined,
  })
  return {
    close: () => runLifecycleOperations(
      [
        () => transport.close(),
        () => protocolServer.close(),
      ],
      'MCP protocol cleanup failed',
    ),
    connect: () => protocolServer.connect(transport),
    handleRequest: (request, response, body) => transport.handleRequest(request, response, body),
    interrupt: () => transport.close(),
  }
}

export async function startMcpHttpServer(
  configuration: DesktopMcpConfiguration,
  notes: NoteApplicationService,
  dependencies: McpHttpServerDependencies = {},
): Promise<() => Promise<void>> {
  if (configuration.accessToken.length < 32)
    throw new TypeError('MCP access token must contain at least 32 characters')

  const activeConnections = new Set<OwnedMcpProtocolConnection>()
  const activeBodyRequestAborts = new Set<() => void>()
  const requestOperations = createOperationSupervisor('MCP HTTP server', {
    concurrency: 'unbounded',
  })
  let stopping = false
  const handleRequest = async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
    try {
      if (stopping) {
        response.writeHead(503).end()
        return
      }
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

      const abortBodyRead = () => request.destroy()
      activeBodyRequestAborts.add(abortBodyRead)
      let body: unknown
      try {
        body = await readJson(request)
      }
      finally {
        activeBodyRequestAborts.delete(abortBodyRead)
      }
      // Body parsing yields to the event loop; shutdown may have started while
      // the request was being read. Do not acquire a protocol transport after
      // the shutdown snapshot has already been taken.
      if (stopping) {
        response.writeHead(503).end()
        return
      }
      const connection = (dependencies.createConnection ?? createMcpProtocolConnection)(notes)
      let ownedConnection: OwnedMcpProtocolConnection
      const connectionResources = createResourceScope('MCP protocol connection', {
        closeMode: 'dependent',
      })
      connectionResources.own({ close: connection.close, name: 'MCP protocol transport' })
      connectionResources.commit()
      const closeProtocol = async (): Promise<void> => {
        await connectionResources.close()
        activeConnections.delete(ownedConnection)
      }
      ownedConnection = { close: closeProtocol, interrupt: connection.interrupt }
      activeConnections.add(ownedConnection)
      response.once('close', () => {
        void closeProtocol().then(undefined, (error) => {
          if (!stopping)
            console.error('Failed to close disconnected MCP protocol', error)
        })
      })
      let requestFailure: unknown | undefined
      try {
        await connection.connect()
        await connection.handleRequest(request, response, body)
      }
      catch (error) {
        requestFailure = error
      }
      let cleanupFailure: unknown | undefined
      if (!stopping) {
        try {
          await closeProtocol()
        }
        catch (error) {
          cleanupFailure = error
        }
      }
      if (requestFailure !== undefined && cleanupFailure !== undefined) {
        throw combineLifecycleFailures(
          [requestFailure, cleanupFailure],
          'MCP request and protocol cleanup failed',
        )
      }
      if (requestFailure !== undefined)
        throw requestFailure
      if (cleanupFailure !== undefined)
        throw cleanupFailure
    }
    catch (error) {
      if (!stopping && !(error instanceof McpHttpRequestError))
        console.error('Failed to handle MCP request', error)
      if (!response.headersSent) {
        const failure = error instanceof McpHttpRequestError
          ? error
          : new McpHttpRequestError(500, -32603, 'Internal server error')
        jsonRpcError(response, failure.status, failure.rpcCode, failure.message)
      }
    }
  }
  const httpServer = createServer((request, response) => {
    void requestOperations.run(() => handleRequest(request, response)).catch((error) => {
      if (!stopping)
        console.error('Failed to admit MCP request', error)
      if (!response.headersSent)
        response.writeHead(stopping ? 503 : 500).end()
    })
  })
  httpServer.requestTimeout = 30_000
  httpServer.headersTimeout = 15_000

  try {
    await new Promise<void>((resolve, reject) => {
      httpServer.once('error', reject)
      httpServer.listen(configuration.port, '127.0.0.1', () => {
        httpServer.off('error', reject)
        resolve()
      })
    })
  }
  catch (error) {
    try {
      await runLifecycleOperations(
        [
          () => new Promise<void>(resolve => httpServer.close(() => resolve())),
          () => requestOperations.close(),
        ],
        'MCP HTTP startup rollback failed',
      )
    }
    catch (cleanupError) {
      throw combineLifecycleFailures(
        [error, cleanupError],
        'MCP HTTP startup and rollback failed',
      )
    }
    throw error
  }
  const closeHttpServer = (): Promise<void> => new Promise<void>((resolve, reject) => {
    httpServer.close((error) => {
      if (error && (error as { code?: string }).code !== 'ERR_SERVER_NOT_RUNNING') {
        reject(error)
        return
      }
      resolve()
    })
  })

  const resources = createResourceScope('MCP HTTP server')
  resources.own({
    name: 'MCP HTTP lifetime',
    close: async () => {
      const listenerClosing = closeHttpServer()
      const drainRequests = async (): Promise<void> => {
        const draining = requestOperations.close()
        let timer: ReturnType<typeof setTimeout> | undefined
        try {
          const drainedWithinGrace = await Promise.race([
            draining.then(() => true),
            new Promise<boolean>((resolve) => {
              timer = setTimeout(() => resolve(false), requestDrainGraceMilliseconds)
            }),
          ])
          if (!drainedWithinGrace) {
            await runLifecycleOperations(
              [...activeConnections].map(connection => () => connection.interrupt()),
              'MCP active transport interruption failed',
            )
          }
          await draining
        }
        finally {
          if (timer !== undefined)
            clearTimeout(timer)
        }
      }
      await runLifecycleOperations(
        [
          () => runLifecycleOperations(
            [
              drainRequests,
              () => runLifecycleOperations(
                [...activeConnections].map(connection => () => connection.close()),
                'MCP active connection cleanup failed',
              ),
            ],
            'MCP protocol shutdown failed',
            'sequential',
          ),
          () => listenerClosing,
        ],
        'MCP HTTP server cleanup failed',
      )
    },
  })
  resources.commit()
  return () => {
    stopping = true
    for (const abortRequest of activeBodyRequestAborts)
      abortRequest()
    return resources.close()
  }
}
