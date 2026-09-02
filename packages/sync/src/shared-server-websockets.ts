import type { ComponentLogger, CreateListenerOptions, Libp2pEvents, Listener, ListenerEvents, Metrics, Transport } from '@libp2p/interface'
import type { AbstractMultiaddrConnectionInit } from '@libp2p/utils'
import type { Multiaddr } from '@multiformats/multiaddr'
import type { TypedEventTarget } from 'main-event'
import type { Buffer } from 'node:buffer'
import type { Server } from 'node:http'
import type { Duplex } from 'node:stream'
import type { Uint8ArrayList } from 'uint8arraylist'
import type { WebSocket } from 'ws'
import { Buffer as NodeBuffer } from 'node:buffer'
import { transportSymbol } from '@libp2p/interface'
import { AbstractMultiaddrConnection, getNetConfig, ipPortToMultiaddr, repeatingTask } from '@libp2p/utils'
import { webSockets } from '@libp2p/websockets'
import { multiaddr } from '@multiformats/multiaddr'
import { TypedEventEmitter } from 'main-event'
import { WebSocketServer } from 'ws'

interface Components {
  readonly logger: ComponentLogger
  readonly events: TypedEventTarget<Libp2pEvents>
  readonly metrics?: Metrics
}

interface SharedServerWebSocketsInit {
  readonly server: Server
}

class WebSocketConnection extends AbstractMultiaddrConnection {
  private readonly websocket: WebSocket
  private readonly maxBufferedAmount = 4 * 1024 * 1024
  private readonly checkBufferedAmountTask

  constructor(init: AbstractMultiaddrConnectionInit & { readonly websocket: WebSocket }) {
    super(init)
    this.websocket = init.websocket
    this.checkBufferedAmountTask = repeatingTask(() => {
      if (this.websocket.bufferedAmount === 0) {
        this.checkBufferedAmountTask.stop()
        this.safeDispatchEvent('drain')
      }
    }, 10)
    this.websocket.binaryType = 'arraybuffer'
    this.websocket.on('close', (code: number) => {
      this.checkBufferedAmountTask.stop()
      if (code === 1000)
        this.onTransportClosed()
      else
        this.onRemoteReset()
    })
    this.websocket.on('message', (data: WebSocket.RawData) => {
      const value = data instanceof Uint8Array
        ? data
        : Array.isArray(data)
          ? NodeBuffer.concat(data)
          : new Uint8Array(data as ArrayBuffer)
      this.onData(value)
    })
    this.websocket.on('error', error => this.abort(error instanceof Error ? error : new Error(String(error))))
  }

  sendData(data: Uint8ArrayList): { readonly sentBytes: number, readonly canSendMore: boolean } {
    for (const chunk of data)
      this.websocket.send(chunk)
    const canSendMore = this.websocket.bufferedAmount < this.maxBufferedAmount
    if (!canSendMore)
      this.checkBufferedAmountTask.start()
    return { canSendMore, sentBytes: data.byteLength }
  }

  sendReset(): void {
    this.websocket.close(1006)
  }

  async sendClose(): Promise<void> {
    this.websocket.close()
  }

  sendPause(): void {}
  sendResume(): void {}
}

class SharedServerListener extends TypedEventEmitter<ListenerEvents> implements Listener {
  private readonly wsServer = new WebSocketServer({ noServer: true })
  private readonly shutdownController = new AbortController()
  private readonly upgradeHandler: (request: import('node:http').IncomingMessage, socket: Duplex, head: Buffer) => void
  private readonly addrs: Multiaddr[] = []
  private listening = false

  constructor(private readonly components: Components, private readonly init: SharedServerWebSocketsInit & CreateListenerOptions) {
    super()
    this.upgradeHandler = (request, socket, head) => {
      if (request.headers.upgrade?.toLowerCase() !== 'websocket') {
        socket.destroy()
        return
      }
      this.wsServer.handleUpgrade(request, socket, head, (websocket) => {
        const remoteAddr = ipPortToMultiaddr(request.socket.remoteAddress ?? '0.0.0.0', request.socket.remotePort ?? 0).encapsulate('/ws')
        const connection = new WebSocketConnection({
          direction: 'inbound',
          log: this.components.logger.forComponent('memorilo:sync:websocket'),
          remoteAddr,
          websocket,
        })
        void this.init.upgrader.upgradeInbound(connection, { signal: this.shutdownController.signal }).catch(async () => {
          await connection.close().catch(() => undefined)
        })
      })
    }
  }

  async listen(ma: Multiaddr): Promise<void> {
    const config = getNetConfig(ma)
    const address = this.init.server.address()
    if (address === null || typeof address === 'string')
      throw new Error('Shared WebSocket server must already be listening on TCP')
    this.addrs.splice(0, this.addrs.length, multiaddr(`/ip4/${config.host === '0.0.0.0' ? '127.0.0.1' : config.host}/tcp/${address.port}/ws`))
    this.init.server.on('upgrade', this.upgradeHandler)
    this.listening = true
    this.safeDispatchEvent('listening')
  }

  async close(): Promise<void> {
    if (!this.listening)
      return
    this.listening = false
    this.init.server.off('upgrade', this.upgradeHandler)
    this.shutdownController.abort()
    await new Promise<void>(resolve => this.wsServer.close(() => resolve()))
    this.safeDispatchEvent('close')
  }

  getAddrs(): Multiaddr[] {
    return [...this.addrs]
  }

  updateAnnounceAddrs(): void {}

  [Symbol.toStringTag] = 'memorilo-shared-server-websocket-listener'
}

export function sharedServerWebSockets(server: Server): (components: Components) => Transport {
  return (components) => {
    const outbound = webSockets()(components)
    return {
      [transportSymbol]: true,
      [Symbol.toStringTag]: 'memorilo-shared-server-websockets',
      dial: outbound.dial.bind(outbound),
      createListener: (options: CreateListenerOptions) => new SharedServerListener(components, { ...options, server }),
      listenFilter: outbound.listenFilter.bind(outbound),
      dialFilter: outbound.dialFilter.bind(outbound),
    } as Transport
  }
}
