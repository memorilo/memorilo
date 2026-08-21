import type { Libp2p, PeerId, PrivateKey } from '@libp2p/interface'
import type { DeviceId, PairedDevice, PairingInvitation, PairingMessage, PairingResponse, SyncChange, SyncHello, SyncMessage, VersionVector } from './model'
import type { PairingManager } from './pairing'
import { Buffer } from 'node:buffer'
import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { noise } from '@chainsafe/libp2p-noise'
import { yamux } from '@chainsafe/libp2p-yamux'
import { keys } from '@libp2p/crypto'
import { identify } from '@libp2p/identify'
import { mdns } from '@libp2p/mdns'
import { tcp } from '@libp2p/tcp'
import { createLibp2p } from 'libp2p'
import { decodeMessage, decodePairingMessage, encodeMessage, encodePairingMessage, maxSyncFrameBytes } from './model'
import { decodePairingPayload, JsonPairingStore, pairingEmojiForSecret, PairingManager as PairingManagerClass } from './pairing'

export const memoriloSyncProtocol = '/memorilo/sync/1'
export const memoriloPairingProtocol = '/memorilo/pairing/1'

export interface SyncStateProvider {
  getVersionVector: () => VersionVector
  getMembershipEpoch: () => number
  observeMembershipEpoch?: (epoch: number) => Promise<void>
  getChanges: (since: VersionVector) => Promise<readonly SyncChange[]>
  applyChanges: (changes: readonly SyncChange[], peer: PairedDevice, remoteMembershipEpoch: number) => Promise<void>
  acknowledgeChanges?: (changeIds: readonly string[], peer: PairedDevice) => Promise<void>
}

export interface P2pNodeOptions {
  readonly identity: {
    deviceId: DeviceId
    deviceName: string
  }
  readonly pairing: PairingManager
  readonly privateKey?: PrivateKey
  readonly provider?: SyncStateProvider
  readonly listenAddresses?: readonly string[]
  readonly now?: () => number
  readonly pairingAvailability?: () => number | null
  readonly pairingProbeIntervalMs?: number
  readonly reconnectIntervalMs?: number
  readonly onStatus?: (status: P2pNodeStatus) => void
  readonly onPairingMessage?: (message: PairingMessage, peerId: string) => Promise<void>
}

export interface P2pNodeStatus {
  readonly state: 'stopped' | 'starting' | 'ready' | 'error'
  readonly peerId: string | null
  readonly connectedPeers: readonly string[]
  readonly devices: readonly P2pDeviceStatus[]
  readonly error: string | null
  readonly discoveredPeers: readonly { deviceId: string, deviceName: string, peerId: string }[]
}

export interface P2pDeviceStatus {
  readonly deviceId: string
  readonly deviceName: string
  readonly peerId: string
  readonly state: 'connecting' | 'syncing' | 'synced' | 'paused' | 'error'
  readonly error: string | null
}

export interface P2pNodeHandle {
  readonly node: Libp2p
  readonly status: () => P2pNodeStatus
  readonly close: () => Promise<void>
  readonly syncPeer: (peerId: string, dialTarget?: unknown) => Promise<void>
  readonly requestPairing: (peerId: string) => Promise<{ deviceId: string, deviceName: string, peerId: string, requestId: string }>
  readonly sendPairingMessage: (peerId: string, message: PairingMessage) => Promise<void>
}

export interface P2pApplicationOptions {
  readonly statePath: string
  readonly deviceName: string
  readonly now?: () => number
  readonly provider?: SyncStateProvider
  readonly onStatus?: (status: P2pNodeStatus) => void
}

export interface P2pApplication {
  readonly pairing: PairingManager
  readonly localDevice: () => { deviceId: DeviceId, deviceName: string, peerId: string }
  readonly updateDeviceName: (deviceName: string) => Promise<void>
  readonly status: () => P2pNodeStatus
  readonly createInvitation: () => Promise<string>
  readonly acceptInvitation: (invitation: string) => Promise<string>
  readonly completePairing: (response: string) => Promise<PairedDevice>
  readonly removeDevice: (deviceId: DeviceId) => Promise<void>
  readonly observeMembershipEpoch: (epoch: number) => Promise<void>
  readonly membershipEpoch: () => number
  readonly enableDiscovery: () => Promise<number>
  readonly discoveryEnabled: () => boolean
  readonly discoveredPeers: () => readonly { deviceId: string, deviceName: string, peerId: string }[]
  readonly requestPairing: (peerId: string) => Promise<{ requestId: string, deviceId: string, deviceName: string, peerId: string }>
  readonly listPairingRequests: () => readonly { requestId: string, deviceId: string, deviceName: string, peerId: string, emoji: string }[]
  readonly approvePairing: (requestId: string) => Promise<string>
  readonly confirmPairing: (requestId: string, emoji: string) => Promise<PairedDevice | null>
  readonly close: () => Promise<void>
}

interface P2pState {
  readonly deviceId: DeviceId
  deviceName: string
  membershipEpoch: number
  readonly privateKey: string
  pendingInvitations: Record<string, PendingInvitation>
}

interface PendingInvitation {
  readonly expiresAt: number
  readonly sharedSecret: string
}

export interface SyncStream {
  readonly send: (data: Uint8Array) => boolean
  readonly onDrain?: () => Promise<void>
  readonly [Symbol.asyncIterator]: () => AsyncIterator<unknown>
  readonly close?: () => Promise<void>
}

function bytesFromChunk(chunk: unknown): Uint8Array {
  if (chunk instanceof Uint8Array)
    return chunk
  if (typeof chunk === 'object' && chunk !== null && 'subarray' in chunk && typeof chunk.subarray === 'function')
    return chunk.subarray()
  throw new TypeError('Unsupported libp2p stream chunk')
}

interface MessageReader {
  readonly read: () => Promise<SyncMessage>
}

function createMessageReader(stream: SyncStream): MessageReader {
  const iterator = stream[Symbol.asyncIterator]()
  let buffer = new Uint8Array()
  let ended = false

  return {
    read: async () => {
      while (true) {
        if (buffer.byteLength >= 4) {
          const frameLength = new DataView(buffer.buffer, buffer.byteOffset, 4).getUint32(0)
          if (frameLength > maxSyncFrameBytes)
            throw new RangeError('Memorilo sync message exceeds the maximum frame size')
          if (buffer.byteLength >= frameLength + 4) {
            const frame = buffer.slice(4, frameLength + 4)
            buffer = buffer.slice(frameLength + 4)
            return decodeMessage(frame)
          }
        }
        if (ended)
          throw new Error('Peer closed the sync stream before sending a message')
        const result = await iterator.next()
        if (result.done) {
          ended = true
          continue
        }
        const chunk = bytesFromChunk(result.value)
        const next = new Uint8Array(buffer.byteLength + chunk.byteLength)
        next.set(buffer)
        next.set(chunk, buffer.byteLength)
        buffer = next
      }
    },
  }
}

function createPairingReader(stream: SyncStream): { read: () => Promise<PairingMessage> } {
  const iterator = stream[Symbol.asyncIterator]()
  let buffer = new Uint8Array()
  return {
    read: async () => {
      while (buffer.byteLength < 4 || buffer.byteLength < new DataView(buffer.buffer, buffer.byteOffset, 4).getUint32(0) + 4) {
        const result = await iterator.next()
        if (result.done)
          throw new Error('Peer closed the pairing stream')
        const chunk = bytesFromChunk(result.value)
        const next = new Uint8Array(buffer.byteLength + chunk.byteLength)
        next.set(buffer)
        next.set(chunk, buffer.byteLength)
        buffer = next
      }
      const frameLength = new DataView(buffer.buffer, buffer.byteOffset, 4).getUint32(0)
      const frame = buffer.slice(0, frameLength + 4)
      buffer = buffer.slice(frameLength + 4)
      return decodePairingMessage(frame)
    },
  }
}

async function writeMessage(stream: SyncStream, message: SyncMessage): Promise<void> {
  if (!stream.send(encodeMessage(message)))
    await stream.onDrain?.()
}

async function writePairingMessage(stream: SyncStream, message: PairingMessage): Promise<void> {
  if (!stream.send(encodePairingMessage(message)))
    await stream.onDrain?.()
}

function peerString(peer: PeerId | string): string {
  return typeof peer === 'string' ? peer : peer.toString()
}

function normalizeDeviceName(deviceName: string): string {
  const normalized = deviceName.trim()
  if (normalized.length === 0)
    throw new TypeError('Device name must not be empty')
  if (normalized.length > 80)
    throw new RangeError('Device name must not exceed 80 characters')
  if (/\p{Cc}/u.test(normalized))
    throw new TypeError('Device name must not contain control characters')
  return normalized
}

export async function createP2pNode(options: P2pNodeOptions): Promise<P2pNodeHandle> {
  const now = options.now ?? Date.now
  let currentStatus: P2pNodeStatus = {
    connectedPeers: [],
    devices: [],
    discoveredPeers: [],
    error: null,
    peerId: null,
    state: 'starting',
  }
  const updateStatus = (patch: Partial<P2pNodeStatus>) => {
    currentStatus = { ...currentStatus, ...patch }
    options.onStatus?.(currentStatus)
  }
  const node = await createLibp2p({
    ...(options.privateKey === undefined ? {} : { privateKey: options.privateKey }),
    addresses: { listen: [...(options.listenAddresses ?? ['/ip4/0.0.0.0/tcp/0'])] },
    connectionEncrypters: [noise()],
    peerDiscovery: [mdns()],
    services: { identify: identify() },
    streamMuxers: [yamux()],
    transports: [tcp()],
  })
  updateStatus({ peerId: node.peerId.toString(), state: 'ready' })

  const connected = new Set<string>()
  const discoveredPeers = new Map<string, { deviceId: string, deviceName: string, expiresAt: number, peerId: string }>()
  const discoveredTargets = new Map<string, unknown>()
  const advertisedPairingPeers = new Map<string, number>()
  const pairingProbes = new Map<string, { requestId: string, sentAt: number }>()
  const dialing = new Set<string>()
  const activeSyncs = new Map<string, Promise<void>>()
  const deviceStates = new Map<string, Pick<P2pDeviceStatus, 'error' | 'state'>>()
  const shouldInitiate = (peerId: string): boolean => node.peerId.toString() < peerId
  const authorizedConnectedPeers = (): readonly string[] => [...connected].filter(peerId => options.pairing.findByPeerId(peerId) !== undefined)
  const deviceStatuses = (): readonly P2pDeviceStatus[] => [...deviceStates.entries()].flatMap(([peerId, status]) => {
    const device = options.pairing.findByPeerId(peerId)
    return device === undefined
      ? []
      : [{
          deviceId: device.deviceId,
          deviceName: device.deviceName,
          error: status.error,
          peerId,
          state: status.state,
        }]
  })
  const updateDeviceStatus = (
    peerId: string,
    state: P2pDeviceStatus['state'],
    error: string | null = null,
  ): void => {
    if (options.pairing.findByPeerId(peerId) === undefined)
      return
    deviceStates.set(peerId, { error, state })
    updateStatus({ devices: deviceStatuses() })
  }
  const availablePeers = (): readonly { deviceId: string, deviceName: string, peerId: string }[] => {
    const currentTime = now()
    const available: { deviceId: string, deviceName: string, peerId: string }[] = []
    for (const [peerId, peer] of discoveredPeers) {
      if (peer.expiresAt <= currentTime || options.pairing.findByPeerId(peerId) !== undefined) {
        discoveredPeers.delete(peerId)
        continue
      }
      available.push({ deviceId: peer.deviceId, deviceName: peer.deviceName, peerId: peer.peerId })
    }
    return available
  }
  const updateDiscoveredPeers = (): void => updateStatus({ discoveredPeers: availablePeers() })
  const requireType = <T extends SyncMessage['type']>(message: SyncMessage, type: T): Extract<SyncMessage, { type: T }> => {
    if (message.type !== type)
      throw new Error(`Expected ${type} message, received ${message.type}`)
    return message as Extract<SyncMessage, { type: T }>
  }
  const acknowledge = async (changeIds: readonly string[], paired: PairedDevice): Promise<void> => {
    await options.provider?.acknowledgeChanges?.(changeIds, paired)
  }
  const applyChanges = async (changes: Extract<SyncMessage, { type: 'changes' }>, paired: PairedDevice): Promise<void> => {
    await options.pairing.updateDeviceName(paired.peerId, changes.deviceName)
    await options.provider?.observeMembershipEpoch?.(changes.membershipEpoch)
    await options.provider?.applyChanges(changes.changes, paired, changes.membershipEpoch)
  }
  const handleIncomingSession = async (stream: SyncStream, paired: PairedDevice): Promise<void> => {
    updateDeviceStatus(paired.peerId, 'syncing')
    try {
      const reader = createMessageReader(stream)
      const hello = requireType(await reader.read(), 'hello')
      if (hello.pairingId !== paired.pairingId || hello.sharedSecret !== paired.sharedSecret)
        throw new Error('Peer pairing credentials were rejected')
      await options.pairing.updateDeviceName(paired.peerId, hello.deviceName)
      await options.pairing.markSeen(paired.peerId)

      const changesForPeer = await options.provider?.getChanges(hello.versionVector) ?? []
      await writeMessage(stream, {
        changes: changesForPeer,
        deviceName: options.identity.deviceName,
        membershipEpoch: options.provider?.getMembershipEpoch() ?? 0,
        type: 'changes',
        versionVector: options.provider?.getVersionVector() ?? {},
      })
      const remoteAcknowledgement = requireType(await reader.read(), 'ack')
      await acknowledge(remoteAcknowledgement.acceptedChangeIds, paired)

      const changesFromPeer = requireType(await reader.read(), 'changes')
      await applyChanges(changesFromPeer, paired)
      await writeMessage(stream, {
        acceptedChangeIds: changesFromPeer.changes.map(change => change.id),
        membershipEpoch: options.provider?.getMembershipEpoch() ?? 0,
        type: 'ack',
        versionVector: options.provider?.getVersionVector() ?? {},
      })
      updateDeviceStatus(paired.peerId, 'synced')
    }
    catch (error) {
      updateDeviceStatus(paired.peerId, 'error', error instanceof Error ? error.message : String(error))
      throw error
    }
  }

  const syncPeer = async (peerId: string, dialTarget?: unknown): Promise<void> => {
    const activeSync = activeSyncs.get(peerId)
    if (activeSync !== undefined)
      return activeSync
    const paired = options.pairing.findByPeerId(peerId)
    if (!paired || options.provider === undefined)
      return
    const provider = options.provider
    const task = (async () => {
      updateDeviceStatus(peerId, 'connecting')
      try {
        const connection = node.getConnections().find(current => peerString(current.remotePeer) === peerId)
        const stream = await (connection === undefined
          ? node.dialProtocol((dialTarget ?? peerId) as never, memoriloSyncProtocol)
          : connection.newStream(memoriloSyncProtocol)) as unknown as SyncStream
        updateDeviceStatus(peerId, 'syncing')
        const reader = createMessageReader(stream)
        const hello: SyncHello = {
          deviceId: options.identity.deviceId,
          deviceName: options.identity.deviceName,
          membershipEpoch: provider.getMembershipEpoch(),
          pairingId: paired.pairingId,
          protocol: 'memorilo-sync/1',
          sharedSecret: paired.sharedSecret,
          type: 'hello',
          versionVector: provider.getVersionVector(),
        }
        await writeMessage(stream, hello)

        const changesFromPeer = requireType(await reader.read(), 'changes')
        await applyChanges(changesFromPeer, paired)
        await writeMessage(stream, {
          acceptedChangeIds: changesFromPeer.changes.map(change => change.id),
          membershipEpoch: provider.getMembershipEpoch(),
          type: 'ack',
          versionVector: provider.getVersionVector(),
        })

        const changesForPeer = await provider.getChanges(changesFromPeer.versionVector)
        await writeMessage(stream, {
          changes: changesForPeer,
          deviceName: options.identity.deviceName,
          membershipEpoch: provider.getMembershipEpoch(),
          type: 'changes',
          versionVector: provider.getVersionVector(),
        })
        const acknowledgement = requireType(await reader.read(), 'ack')
        await acknowledge(acknowledgement.acceptedChangeIds, paired)
        await stream.close?.()
        updateDeviceStatus(peerId, 'synced')
      }
      catch (error) {
        updateDeviceStatus(peerId, 'error', error instanceof Error ? error.message : String(error))
        throw error
      }
    })()
    activeSyncs.set(peerId, task)
    try {
      await task
    }
    finally {
      if (activeSyncs.get(peerId) === task)
        activeSyncs.delete(peerId)
    }
  }

  const sendPairingMessage = async (peerId: string, message: PairingMessage): Promise<void> => {
    const connection = node.getConnections().find(current => peerString(current.remotePeer) === peerId)
    if (connection === undefined) {
      const target = discoveredTargets.get(peerId)
      if (target !== undefined)
        await node.dial(target as never)
    }
    const connected = node.getConnections().find(current => peerString(current.remotePeer) === peerId)
    const stream = await (connected === undefined
      ? node.dialProtocol((discoveredTargets.get(peerId) ?? peerId) as never, memoriloPairingProtocol)
      : connected.newStream(memoriloPairingProtocol)) as unknown as SyncStream
    await writePairingMessage(stream, message)
    await stream.close?.()
  }

  const probePairingAvailability = async (peerId: string): Promise<void> => {
    if (options.pairing.findByPeerId(peerId) !== undefined)
      return
    const available = discoveredPeers.get(peerId)
    if (available !== undefined && available.expiresAt > now())
      return
    const previous = pairingProbes.get(peerId)
    const requestId = previous?.requestId ?? randomUUID()
    pairingProbes.set(peerId, { requestId, sentAt: now() })
    await sendPairingMessage(peerId, { requestId, type: 'pairing-probe' })
  }

  await node.handle(memoriloSyncProtocol, async (stream, connection) => {
    const peerId = peerString(connection.remotePeer)
    const paired = options.pairing.findByPeerId(peerId)
    if (!paired || options.provider === undefined) {
      await stream.close()
      return
    }
    try {
      await handleIncomingSession(stream as unknown as SyncStream, paired)
      await stream.close()
    }
    catch (error) {
      console.warn(`Memorilo sync stream rejected for ${peerId}`, error)
      await stream.close()
    }
  })

  await node.handle(memoriloPairingProtocol, async (stream, connection) => {
    const peerId = peerString(connection.remotePeer)
    try {
      const message = await createPairingReader(stream as unknown as SyncStream).read()
      if (message.type === 'pairing-probe') {
        const expiresAt = options.pairingAvailability?.()
        if (expiresAt !== null && expiresAt !== undefined && expiresAt > now()) {
          await sendPairingMessage(peerId, {
            deviceId: options.identity.deviceId,
            deviceName: options.identity.deviceName,
            expiresAt,
            peerId: node.peerId.toString(),
            requestId: message.requestId,
            type: 'pairing-available',
          })
          advertisedPairingPeers.set(peerId, expiresAt)
        }
        return
      }
      if (message.type === 'pairing-available') {
        const probe = pairingProbes.get(peerId)
        if (probe?.requestId === message.requestId
          && message.peerId === peerId
          && message.expiresAt > now()
          && options.pairing.findByPeerId(peerId) === undefined) {
          discoveredPeers.set(peerId, {
            deviceId: message.deviceId,
            deviceName: message.deviceName,
            expiresAt: message.expiresAt,
            peerId,
          })
          updateDiscoveredPeers()
        }
        return
      }
      if (message.type === 'pairing-request' && (advertisedPairingPeers.get(peerId) ?? 0) <= now())
        return
      await options.onPairingMessage?.(message, peerId)
    }
    catch {
      await stream.close()
    }
  })

  node.addEventListener('peer:discovery', (event) => {
    const discovered = event.detail
    const peerId = peerString(discovered.id)
    const known = options.pairing.list().find(device => device.peerId === peerId)
    discoveredTargets.set(peerId, discovered.multiaddrs)
    if (known === undefined) {
      void probePairingAvailability(peerId).catch(() => undefined)
      return
    }
    if (!shouldInitiate(peerId))
      return
    if (dialing.has(peerId))
      return
    dialing.add(peerId)
    void node.dial(discovered.multiaddrs as never).then(() => syncPeer(peerId)).catch(() => undefined).finally(() => dialing.delete(peerId))
  })
  node.addEventListener('connection:open', (event) => {
    const peerId = peerString(event.detail.remotePeer)
    connected.add(peerId)
    if (options.pairing.findByPeerId(peerId) !== undefined)
      deviceStates.set(peerId, { error: null, state: 'connecting' })
    updateStatus({ connectedPeers: authorizedConnectedPeers(), devices: deviceStatuses() })
    if (options.pairing.findByPeerId(peerId) && shouldInitiate(peerId)) {
      if (!dialing.has(peerId)) {
        dialing.add(peerId)
        void syncPeer(peerId).catch(() => undefined).finally(() => dialing.delete(peerId))
      }
    }
  })
  node.addEventListener('connection:close', (event) => {
    const peerId = peerString(event.detail.remotePeer)
    connected.delete(peerId)
    const deviceState = deviceStates.get(peerId)
    if (deviceState?.state !== 'error' && deviceState?.state !== 'paused')
      deviceStates.delete(peerId)
    updateStatus({ connectedPeers: authorizedConnectedPeers(), devices: deviceStatuses() })
  })

  const reconnectTimer = setInterval(() => {
    for (const paired of options.pairing.list()) {
      const peerId = paired.peerId
      if (!shouldInitiate(peerId) || connected.has(peerId) || dialing.has(peerId))
        continue
      dialing.add(peerId)
      void node.dial(peerId as never).then(() => syncPeer(peerId)).catch(() => undefined).finally(() => dialing.delete(peerId))
    }
  }, options.reconnectIntervalMs ?? 5_000)
  const pairingProbeTimer = setInterval(() => {
    updateDiscoveredPeers()
    for (const peerId of discoveredTargets.keys()) {
      if (options.pairing.findByPeerId(peerId) !== undefined)
        continue
      const previous = pairingProbes.get(peerId)
      if (previous !== undefined && now() - previous.sentAt < (options.pairingProbeIntervalMs ?? 1_000))
        continue
      void probePairingAvailability(peerId).catch(() => undefined)
    }
  }, options.pairingProbeIntervalMs ?? 1_000)

  return {
    close: async () => {
      clearInterval(reconnectTimer)
      clearInterval(pairingProbeTimer)
      connected.clear()
      deviceStates.clear()
      updateStatus({ connectedPeers: [], devices: [], state: 'stopped' })
      await node.stop()
    },
    node,
    status: () => ({
      ...currentStatus,
      connectedPeers: [...authorizedConnectedPeers()],
      devices: [...deviceStatuses()],
      discoveredPeers: [...availablePeers()],
    }),
    syncPeer,
    sendPairingMessage,
    requestPairing: async (peerId: string) => {
      const available = discoveredPeers.get(peerId)
      if (available === undefined || available.expiresAt <= now()) {
        discoveredPeers.delete(peerId)
        updateDiscoveredPeers()
        throw new Error('Peer is not available for pairing')
      }
      const request = {
        createdAt: now(),
        deviceId: options.identity.deviceId,
        deviceName: options.identity.deviceName,
        peerId: node.peerId.toString(),
        requestId: randomUUID(),
        type: 'pairing-request' as const,
      }
      await (async () => {
        const connection = node.getConnections().find(current => peerString(current.remotePeer) === peerId)
        if (connection === undefined) {
          const target = discoveredTargets.get(peerId)
          if (target !== undefined)
            await node.dial(target as never)
        }
        const connected = node.getConnections().find(current => peerString(current.remotePeer) === peerId)
        const stream = await (connected === undefined
          ? node.dialProtocol((discoveredTargets.get(peerId) ?? peerId) as never, memoriloPairingProtocol)
          : connected.newStream(memoriloPairingProtocol)) as unknown as SyncStream
        await writePairingMessage(stream, request)
        await stream.close?.()
      })()
      return { deviceId: available.deviceId, deviceName: available.deviceName, peerId: available.peerId, requestId: request.requestId }
    },
  }
}

async function loadState(path: string, deviceName: string): Promise<{ state: P2pState, privateKey: PrivateKey }> {
  const defaultDeviceName = normalizeDeviceName(deviceName)
  try {
    const state = JSON.parse(await readFile(path, 'utf8')) as Partial<P2pState>
    if (typeof state.privateKey !== 'string' || typeof state.deviceId !== 'string' || state.deviceId.length === 0)
      throw new TypeError('P2P identity state is invalid')
    return {
      privateKey: keys.privateKeyFromProtobuf(Buffer.from(state.privateKey, 'base64url')),
      state: {
        deviceId: state.deviceId,
        deviceName: typeof state.deviceName === 'string' && state.deviceName.trim().length > 0 ? normalizeDeviceName(state.deviceName) : defaultDeviceName,
        membershipEpoch: Number.isSafeInteger(state.membershipEpoch) && (state.membershipEpoch as number) > 0 ? state.membershipEpoch as number : 1,
        pendingInvitations: normalizePendingInvitations(state.pendingInvitations),
        privateKey: state.privateKey,
      },
    }
  }
  catch (error) {
    if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT'))
      throw error
    const privateKey = await keys.generateKeyPair('Ed25519')
    return {
      privateKey,
      state: {
        deviceId: randomUUID(),
        deviceName: defaultDeviceName,
        membershipEpoch: 1,
        pendingInvitations: {},
        privateKey: Buffer.from(keys.privateKeyToProtobuf(privateKey)).toString('base64url'),
      },
    }
  }
}

async function saveState(path: string, state: P2pState): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  const temporaryPath = `${path}.tmp-${randomUUID()}`
  await writeFile(temporaryPath, `${JSON.stringify(state)}\n`, { encoding: 'utf8', flag: 'wx' })
  await rename(temporaryPath, path)
}

export async function createP2pApplication(options: P2pApplicationOptions): Promise<P2pApplication> {
  const now = options.now ?? Date.now
  const { state, privateKey } = await loadState(options.statePath, options.deviceName)
  const pairing = new PairingManagerClass(
    { deviceId: state.deviceId, deviceName: state.deviceName, membershipEpoch: state.membershipEpoch, peerId: '' },
    new JsonPairingStore(`${options.statePath}.devices.json`),
  )
  await pairing.load()
  let discoveryUntil = 0
  const pairingRequests = new Map<string, {
    readonly deviceId: string
    readonly deviceName: string
    readonly peerId: string
    readonly emoji: string
    readonly pairingId: string
    readonly sharedSecret: string
    readonly localConfirmed: boolean
    readonly remoteConfirmed: boolean
  }>()
  const outgoingPairingRequests = new Map<string, {
    readonly deviceId: string
    readonly deviceName: string
    readonly peerId: string
    readonly pairingId: string
    readonly sharedSecret: string
    readonly emoji: string
    readonly localConfirmed: boolean
    readonly remoteConfirmed: boolean
  }>()
  let finalizePairing: (requestId: string, request: { deviceId: string, deviceName: string, pairingId: string, peerId: string, sharedSecret: string }) => Promise<PairedDevice>
  const node = await createP2pNode({
    identity: pairing.identity,
    onStatus: options.onStatus,
    pairing,
    privateKey,
    provider: options.provider,
    now,
    pairingAvailability: () => discoveryUntil > now() ? discoveryUntil : null,
    onPairingMessage: async (message, peerId) => {
      if (message.type === 'pairing-request') {
        const request = message
        if (discoveryUntil <= now() || request.peerId !== peerId || pairing.findByPeerId(peerId) !== undefined) {
          return
        }
        pairingRequests.set(request.requestId, {
          deviceId: request.deviceId,
          deviceName: request.deviceName,
          emoji: '',
          pairingId: '',
          peerId: request.peerId,
          sharedSecret: '',
          localConfirmed: false,
          remoteConfirmed: false,
        })
        return
      }
      if (message.type === 'pairing-approval') {
        const approval = message
        const pending = outgoingPairingRequests.get(approval.requestId)
        if (pending === undefined
          || pending.peerId !== peerId
          || pending.deviceId !== approval.deviceId
          || approval.peerId !== peerId) {
          return
        }
        outgoingPairingRequests.set(approval.requestId, {
          deviceId: approval.deviceId,
          deviceName: approval.deviceName,
          emoji: approval.emoji,
          pairingId: approval.pairingId,
          peerId,
          sharedSecret: approval.sharedSecret,
          localConfirmed: false,
          remoteConfirmed: false,
        })
        return
      }
      if (message.type === 'pairing-confirmation') {
        const challenge = pairingRequests.get(message.requestId) ?? outgoingPairingRequests.get(message.requestId)
        if (challenge && challenge.peerId === peerId && challenge.pairingId === message.pairingId && challenge.emoji === message.emoji) {
          const updated = { ...challenge, remoteConfirmed: true }
          if (pairingRequests.has(message.requestId))
            pairingRequests.set(message.requestId, updated)
          else
            outgoingPairingRequests.set(message.requestId, updated)
          if (updated.localConfirmed)
            await finalizePairing(message.requestId, updated)
        }
      }
    },
  })
  pairing.identity.peerId = node.status().peerId ?? ''
  await saveState(options.statePath, state)
  const syncPairedDevice = (device: PairedDevice): void => {
    if (pairing.identity.peerId < device.peerId)
      void node.syncPeer(device.peerId).catch(() => undefined)
  }
  const observeMembershipEpoch = async (epoch: number): Promise<void> => {
    if (!Number.isSafeInteger(epoch) || epoch < 1 || epoch <= state.membershipEpoch)
      return
    state.membershipEpoch = epoch
    pairing.identity.membershipEpoch = epoch
    await saveState(options.statePath, state)
  }
  const recordPairingChange = async (device: PairedDevice, sameGrant: boolean): Promise<void> => {
    if (sameGrant)
      return
    state.membershipEpoch += 1
    pairing.identity.membershipEpoch = state.membershipEpoch
    await saveState(options.statePath, state)
  }
  const removeDevice = async (deviceId: DeviceId): Promise<void> => {
    const existed = pairing.findByDeviceId(deviceId) !== undefined
    await pairing.remove(deviceId)
    if (existed) {
      state.membershipEpoch += 1
      pairing.identity.membershipEpoch = state.membershipEpoch
      await saveState(options.statePath, state)
    }
  }
  const enableDiscovery = async (): Promise<number> => {
    discoveryUntil = now() + 5 * 60 * 1000
    return discoveryUntil
  }
  const discoveryEnabled = (): boolean => discoveryUntil > now()
  const localDevice = () => ({
    deviceId: state.deviceId,
    deviceName: state.deviceName,
    peerId: pairing.identity.peerId,
  })
  const updateDeviceName = async (deviceName: string): Promise<void> => {
    const normalized = normalizeDeviceName(deviceName)
    if (normalized === state.deviceName)
      return
    state.deviceName = normalized
    pairing.identity.deviceName = normalized
    await saveState(options.statePath, state)
    await Promise.all(pairing.list().map(device => node.syncPeer(device.peerId).catch(() => undefined)))
  }
  const listPairingRequests = () => [...pairingRequests.entries(), ...[...outgoingPairingRequests.entries()].filter(([, request]) => request.emoji.length > 0)]
    .map(([requestId, request]) => ({
      deviceId: request.deviceId,
      deviceName: request.deviceName,
      emoji: request.emoji,
      peerId: request.peerId,
      requestId,
    }))
  const approvePairing = async (requestId: string): Promise<string> => {
    const request = pairingRequests.get(requestId)
    if (!request || !discoveryEnabled())
      throw new Error('Pairing request is no longer available')
    const sharedSecret = randomUUID() + randomUUID()
    const pairingId = randomUUID()
    const emoji = pairingEmojiForSecret(sharedSecret)
    const challenge = { ...request, emoji, pairingId, sharedSecret }
    pairingRequests.set(requestId, challenge)
    await node.sendPairingMessage(request.peerId, {
      deviceId: state.deviceId,
      deviceName: state.deviceName,
      emoji,
      membershipEpoch: state.membershipEpoch,
      pairingId,
      peerId: pairing.identity.peerId,
      requestId,
      sharedSecret,
      type: 'pairing-approval',
    })
    return emoji
  }
  finalizePairing = async (requestId: string, request: { deviceId: string, deviceName: string, pairingId: string, peerId: string, sharedSecret: string }): Promise<PairedDevice> => {
    const existing = pairing.findByDeviceId(request.deviceId)
    const device = await pairing.completeGrant(request)
    await recordPairingChange(device, existing?.pairingId === device.pairingId)
    pairingRequests.delete(requestId)
    outgoingPairingRequests.delete(requestId)
    syncPairedDevice(device)
    return device
  }
  const confirmPairing = async (requestId: string, emoji: string): Promise<PairedDevice | null> => {
    const request = pairingRequests.get(requestId) ?? outgoingPairingRequests.get(requestId)
    if (!request || request.emoji !== emoji)
      throw new Error('Pairing emoji does not match')
    const updated = { ...request, localConfirmed: true }
    if (pairingRequests.has(requestId))
      pairingRequests.set(requestId, updated)
    else
      outgoingPairingRequests.set(requestId, updated)
    await node.sendPairingMessage(request.peerId, { emoji, pairingId: request.pairingId, requestId, type: 'pairing-confirmation' })
    return updated.remoteConfirmed ? finalizePairing(requestId, updated) : null
  }
  return {
    acceptInvitation: async (invitation) => {
      const decodedInvitation = decodePairingPayload<PairingInvitation>(invitation)
      await observeMembershipEpoch(decodedInvitation.membershipEpoch)
      pairing.identity.membershipEpoch = state.membershipEpoch
      const invitationDeviceId = decodedInvitation.deviceId
      const existing = pairing.findByDeviceId(invitationDeviceId)
      const decoded = await pairing.acceptInvitation(invitation)
      await recordPairingChange(decoded.device, existing?.pairingId === decoded.device.pairingId)
      syncPairedDevice(decoded.device)
      return decoded.response
    },
    close: node.close,
    completePairing: async (response) => {
      const decodedResponse = decodePairingPayload<PairingResponse>(response)
      await observeMembershipEpoch(decodedResponse.membershipEpoch)
      pairing.identity.membershipEpoch = state.membershipEpoch
      const pending = state.pendingInvitations[decodedResponse.pairingId]
      const responseDeviceId = decodedResponse.deviceId
      const existing = pairing.findByDeviceId(responseDeviceId)
      const matchesPending = pending !== undefined
        && pending.expiresAt > now()
        && pending.sharedSecret === decodedResponse.sharedSecret
      const matchesExistingGrant = existing?.pairingId === decodedResponse.pairingId
        && existing.sharedSecret === decodedResponse.sharedSecret
        && existing.peerId === decodedResponse.peerId
      if (!matchesPending && !matchesExistingGrant)
        throw new Error('Pairing response does not match an active invitation')
      const device = await pairing.completeInvitation(response)
      await recordPairingChange(device, existing?.pairingId === device.pairingId)
      delete state.pendingInvitations[decodedResponse.pairingId]
      await saveState(options.statePath, state)
      syncPairedDevice(device)
      return device
    },
    createInvitation: async () => {
      const encoded = pairing.createInvitation()
      const invitation = decodePairingPayload<PairingInvitation>(encoded)
      const currentTime = now()
      for (const [pairingId, pending] of Object.entries(state.pendingInvitations)) {
        if (pending.expiresAt <= currentTime)
          delete state.pendingInvitations[pairingId]
      }
      state.pendingInvitations[invitation.pairingId] = {
        expiresAt: invitation.expiresAt,
        sharedSecret: invitation.sharedSecret,
      }
      await saveState(options.statePath, state)
      return encoded
    },
    pairing,
    localDevice,
    enableDiscovery,
    discoveryEnabled,
    discoveredPeers: () => node.status().discoveredPeers,
    requestPairing: async (peerId) => {
      const request = await node.requestPairing(peerId)
      outgoingPairingRequests.set(request.requestId, {
        ...request,
        emoji: '',
        pairingId: '',
        sharedSecret: '',
        localConfirmed: false,
        remoteConfirmed: false,
      })
      return request
    },
    listPairingRequests,
    approvePairing,
    confirmPairing,
    membershipEpoch: () => state.membershipEpoch,
    observeMembershipEpoch,
    removeDevice,
    status: node.status,
    updateDeviceName,
  }
}

function normalizePendingInvitations(value: unknown): Record<string, PendingInvitation> {
  if (value === undefined)
    return {}
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new TypeError('P2P pending invitations state is invalid')
  const normalized: Record<string, PendingInvitation> = {}
  for (const [pairingId, candidate] of Object.entries(value)) {
    if (typeof candidate !== 'object' || candidate === null || Array.isArray(candidate))
      throw new TypeError('P2P pending invitation state is invalid')
    const current = candidate as Partial<PendingInvitation>
    if (!Number.isSafeInteger(current.expiresAt) || (current.expiresAt as number) <= 0
      || typeof current.sharedSecret !== 'string' || current.sharedSecret.length === 0) {
      throw new TypeError('P2P pending invitation state is invalid')
    }
    normalized[pairingId] = {
      expiresAt: current.expiresAt as number,
      sharedSecret: current.sharedSecret,
    }
  }
  return normalized
}
