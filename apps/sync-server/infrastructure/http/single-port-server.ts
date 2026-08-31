import type { ServerType } from '@hono/node-server'
import type { Socket } from 'node:net'
import { connect } from 'node:net'
import { createAdaptorServer } from '@hono/node-server'

type FetchCallback = Parameters<typeof createAdaptorServer>[0]['fetch']

export interface SinglePortServerOptions {
  readonly fetch: FetchCallback
  readonly host: string
  readonly peerPort: number
  readonly port: number
}

export interface SinglePortServer {
  readonly close: () => Promise<void>
  readonly listen: () => Promise<number>
}

export function createSinglePortServer(options: SinglePortServerOptions): SinglePortServer {
  const server: ServerType = createAdaptorServer({ fetch: options.fetch })
  const tunnels = new Set<Socket>()
  let listening = false
  let closing: Promise<void> | null = null
  let listenPromise: Promise<number> | null = null

  server.on('upgrade', (request, socket, head) => {
    const connectionHeader = typeof request.headers.connection === 'string' ? request.headers.connection : ''
    const connectionTokens = connectionHeader.split(',').map((token: string) => token.trim().toLowerCase())
    if (request.method !== 'GET'
      || request.url !== '/'
      || request.headers.upgrade?.toLowerCase() !== 'websocket'
      || !connectionTokens.includes('upgrade')) {
      socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\nContent-Length: 0\r\n\r\n')
      return
    }
    const upstream = connect(options.peerPort, '127.0.0.1')
    tunnels.add(socket)
    tunnels.add(upstream)
    const close = (): void => {
      tunnels.delete(socket)
      tunnels.delete(upstream)
      socket.destroy()
      upstream.destroy()
    }
    upstream.once('connect', () => {
      const lines = [`${request.method ?? 'GET'} ${request.url ?? '/'} HTTP/${request.httpVersion}`]
      for (let index = 0; index < request.rawHeaders.length; index += 2)
        lines.push(`${request.rawHeaders[index]}: ${request.rawHeaders[index + 1]}`)
      lines.push('', '')
      upstream.write(lines.join('\r\n'))
      if (head.length > 0)
        upstream.write(head)
      socket.pipe(upstream).pipe(socket)
    })
    upstream.once('error', close)
    upstream.once('close', close)
    socket.once('error', close)
    socket.once('close', close)
  })

  return {
    close: () => {
      if (closing)
        return closing
      closing = new Promise<void>((resolve, reject) => {
        if (!listening && !server.listening) {
          resolve()
          return
        }
        server.close((error) => {
          listening = false
          if (error)
            reject(error)
          else
            resolve()
        })
        for (const tunnel of tunnels)
          tunnel.destroy()
        tunnels.clear()
      })
      return closing
    },
    listen: () => {
      if (listening) {
        const address = server.address()
        if (typeof address === 'object' && address !== null)
          return Promise.resolve(address.port)
      }
      if (listenPromise)
        return listenPromise
      listenPromise = new Promise<number>((resolve, reject) => {
        const onError = (error: Error): void => {
          server.off('error', onError)
          listening = false
          listenPromise = null
          reject(error)
        }
        server.once('error', onError)
        server.listen(options.port, options.host, () => {
          server.off('error', onError)
          listening = true
          const address = server.address()
          if (typeof address !== 'object' || address === null) {
            server.close(() => {
              listening = false
              listenPromise = null
              reject(new Error('Sync server did not bind a TCP address'))
            })
            return
          }
          resolve(address.port)
        })
      })
      return listenPromise
    },
  }
}
