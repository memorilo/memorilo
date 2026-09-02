import type { Server } from 'node:http'
import { createAdaptorServer } from '@hono/node-server'

type FetchCallback = Parameters<typeof createAdaptorServer>[0]['fetch']

export interface SyncServerHttpServer {
  readonly server: Server
  readonly close: () => Promise<void>
  readonly listen: () => Promise<number>
  readonly setFetch: (fetch: FetchCallback) => void
}

export function createSyncServerHttpServer(options: { readonly host: string, readonly port: number }): SyncServerHttpServer {
  let fetch: FetchCallback = (_request, env) => {
    ;(env.outgoing as ServerResponseLike).writeHead(503)
    ;(env.outgoing as ServerResponseLike).end('Sync server is starting')
  }
  const server = createAdaptorServer({ fetch: (request, response) => fetch(request, response) }) as Server
  let listening = false
  let closing: Promise<void> | null = null
  let listenPromise: Promise<number> | null = null

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
    server,
    setFetch: (nextFetch) => {
      fetch = nextFetch
    },
  }
}

interface ServerResponseLike {
  readonly writeHead: (statusCode: number) => unknown
  readonly end: (data?: string) => unknown
}
