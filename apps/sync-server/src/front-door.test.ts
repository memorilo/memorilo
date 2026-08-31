import type { Server } from 'node:net'
import { mkdtemp, rm } from 'node:fs/promises'
import { connect, createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Duration, Effect, Exit } from 'effect'
import { Hono } from 'hono'
import { afterEach, describe, expect, it } from 'vitest'
import { createSqliteSyncDatabase } from '../infrastructure/database/sqlite'
import { createSinglePortServer } from '../infrastructure/http/single-port-server'
import { createFilesystemObjectStore } from '../infrastructure/object-store/filesystem'
import { createSyncServerPeer } from '../infrastructure/p2p/server-peer'

function websocketHandshake(port: number, path = '/'): Promise<string> {
  return Effect.runPromise(Effect.callback<string, Error>((resume) => {
    const socket = connect(port, '127.0.0.1')
    let response = ''
    const finish = (operation: () => void): void => {
      socket.destroy()
      operation()
    }
    socket.setEncoding('utf8')
    socket.on('data', (chunk: string) => {
      response += chunk
      if (response.includes('\r\n\r\n'))
        finish(() => resume(Effect.succeed(response)))
    })
    socket.once('error', error => finish(() => resume(Effect.fail(error))))
    socket.once('connect', () => {
      socket.write([
        `GET ${path} HTTP/1.1`,
        `Host: 127.0.0.1:${port}`,
        'Connection: Upgrade',
        'Upgrade: websocket',
        'Sec-WebSocket-Version: 13',
        'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==',
        '',
        '',
      ].join('\r\n'))
    })
    return Effect.sync(() => socket.destroy())
  }).pipe(Effect.timeout(Duration.seconds(3)), Effect.mapError(error => error instanceof Error ? error : new Error(String(error)))))
}

function listenTcp(port = 0): Effect.Effect<{ readonly port: number, readonly server: Server }, Error, import('effect').Scope.Scope> {
  return Effect.acquireRelease(
    Effect.callback<{ readonly port: number, readonly server: Server }, Error>((resume) => {
      const server = createServer()
      const onError = (error: Error): void => resume(Effect.fail(error))
      server.once('error', onError)
      server.listen(port, '127.0.0.1', () => {
        server.off('error', onError)
        const address = server.address()
        if (typeof address !== 'object' || address === null) {
          resume(Effect.fail(new Error('TCP server did not bind an address')))
          return
        }
        resume(Effect.succeed({ port: address.port, server }))
      })
      return Effect.sync(() => server.close()).pipe(Effect.asVoid, Effect.orDie)
    }),
    ({ server }) => Effect.callback<void, Error>((resume) => {
      if (!server.listening) {
        resume(Effect.succeed(undefined))
        return Effect.void
      }
      server.close(error => error ? resume(Effect.fail(error)) : resume(Effect.succeed(undefined)))
      return Effect.sync(() => server.close())
    }).pipe(Effect.orDie),
  )
}

describe('sync server single-port front door', () => {
  const directories: string[] = []

  afterEach(async () => {
    await Promise.all(directories.splice(0).map(directory => rm(directory, { force: true, recursive: true })))
  })

  it('serves Hono and a real libp2p WebSocket listener on one external port', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'memorilo-sync-front-door-'))
    directories.push(directory)
    const database = createSqliteSyncDatabase({ filename: join(directory, 'sync.sqlite') })
    database.migrate()
    const objectStore = createFilesystemObjectStore({ root: join(directory, 'objects') })
    const peer = await createSyncServerPeer({
      auth: database.auth,
      listenAddress: '/ip4/127.0.0.1/tcp/0/ws',
      objectStore,
      repository: database.repository,
      statePath: join(directory, 'peer.json'),
    })
    const address = peer.multiaddrs[0]?.toString() ?? ''
    const peerPort = Number(address.match(/\/tcp\/(\d+)/u)?.[1])
    expect(Number.isSafeInteger(peerPort)).toBe(true)
    const app = new Hono().get('/healthz', context => context.json({ status: 'ok' }))
    const frontDoor = createSinglePortServer({ fetch: app.fetch, host: '127.0.0.1', peerPort, port: 0 })
    const port = await frontDoor.listen()
    try {
      const health = await fetch(`http://127.0.0.1:${port}/healthz`)
      expect(health.status).toBe(200)
      await expect(health.json()).resolves.toEqual({ status: 'ok' })
      await expect(websocketHandshake(port)).resolves.toMatch(/^HTTP\/1\.1 101 Switching Protocols\r\n/u)
      await expect(websocketHandshake(port, '/not-a-sync-upgrade')).resolves.toMatch(/^HTTP\/1\.1 400 Bad Request\r\n/u)

      const repeatedListen = await Promise.all([frontDoor.listen(), frontDoor.listen()])
      expect(repeatedListen).toEqual([port, port])
      await Promise.all([frontDoor.close(), frontDoor.close()])
      await expect(fetch(`http://127.0.0.1:${port}/healthz`)).rejects.toThrow()
    }
    finally {
      await frontDoor.close()
      await peer.close()
      await objectStore.close()
      database.close()
    }
  })

  it('closes an upgrade tunnel when the internal peer is unavailable', async () => {
    const app = new Hono().get('/healthz', context => context.json({ status: 'ok' }))
    const frontDoor = createSinglePortServer({ fetch: app.fetch, host: '127.0.0.1', peerPort: 1, port: 0 })
    const port = await frontDoor.listen()
    try {
      await expect(websocketHandshake(port)).rejects.toThrow()
    }
    finally {
      await frontDoor.close()
    }
  })

  it('can retry listening after a public-port collision', async () => {
    await Effect.runPromise(Effect.scoped(Effect.gen(function* () {
      const occupied = yield* listenTcp()
      const app = new Hono().get('/healthz', context => context.json({ status: 'ok' }))
      const frontDoor = createSinglePortServer({ fetch: app.fetch, host: '127.0.0.1', peerPort: 1, port: occupied.port })
      const failedListen = yield* Effect.tryPromise({ catch: error => error instanceof Error ? error : new Error(String(error)), try: frontDoor.listen }).pipe(Effect.exit)
      expect(Exit.isFailure(failedListen)).toBe(true)
      yield* Effect.callback<void, Error>((resume) => {
        occupied.server.close(error => error ? resume(Effect.fail(error)) : resume(Effect.succeed(undefined)))
        return Effect.void
      })
      const retryPort = yield* Effect.tryPromise({ catch: error => error instanceof Error ? error : new Error(String(error)), try: frontDoor.listen })
      expect(retryPort).toBe(occupied.port)
      yield* Effect.tryPromise({ catch: error => error instanceof Error ? error : new Error(String(error)), try: frontDoor.close })
    })))
  })
})
