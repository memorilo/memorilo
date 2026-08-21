export type DeviceId = string

export type VersionVector = Readonly<Record<DeviceId, number>>

export interface PairedDevice {
  readonly deviceId: DeviceId
  readonly deviceName: string
  readonly peerId: string
  readonly pairingId: string
  readonly sharedSecret: string
  readonly addedAt: number
  readonly lastSeenAt: number | null
}

export interface PairingInvitation {
  readonly version: 1
  readonly pairingId: string
  readonly deviceId: DeviceId
  readonly deviceName: string
  readonly peerId: string
  readonly sharedSecret: string
  readonly membershipEpoch: number
  readonly createdAt: number
  readonly expiresAt: number
}

export interface PairingResponse {
  readonly version: 1
  readonly pairingId: string
  readonly deviceId: DeviceId
  readonly deviceName: string
  readonly peerId: string
  readonly sharedSecret: string
  readonly membershipEpoch: number
}

export interface PairingRequestMessage {
  readonly type: 'pairing-request'
  readonly requestId: string
  readonly deviceId: DeviceId
  readonly deviceName: string
  readonly peerId: string
  readonly createdAt: number
}

export interface PairingProbeMessage {
  readonly type: 'pairing-probe'
  readonly requestId: string
}

export interface PairingAvailableMessage {
  readonly type: 'pairing-available'
  readonly requestId: string
  readonly deviceId: DeviceId
  readonly deviceName: string
  readonly peerId: string
  readonly expiresAt: number
}

export interface PairingApprovalMessage {
  readonly type: 'pairing-approval'
  readonly requestId: string
  readonly pairingId: string
  readonly deviceId: DeviceId
  readonly deviceName: string
  readonly peerId: string
  readonly sharedSecret: string
  readonly emoji: string
  readonly membershipEpoch: number
}

export interface PairingConfirmationMessage {
  readonly type: 'pairing-confirmation'
  readonly requestId: string
  readonly pairingId: string
  readonly emoji: string
}

export interface PairingRejectedMessage {
  readonly type: 'pairing-rejected'
  readonly requestId: string
  readonly reason: string
}

export type PairingMessage
  = | PairingAvailableMessage
    | PairingProbeMessage
    | PairingRequestMessage
    | PairingApprovalMessage
    | PairingConfirmationMessage
    | PairingRejectedMessage

export interface SyncHello {
  readonly type: 'hello'
  readonly protocol: 'memorilo-sync/1'
  readonly deviceId: DeviceId
  readonly deviceName: string
  readonly membershipEpoch: number
  readonly versionVector: VersionVector
  readonly pairingId: string
  readonly sharedSecret: string
}

export interface SyncChanges {
  readonly type: 'changes'
  readonly deviceName: string
  readonly membershipEpoch: number
  readonly versionVector: VersionVector
  readonly changes: readonly SyncChange[]
}

export interface SyncAck {
  readonly type: 'ack'
  readonly membershipEpoch: number
  readonly versionVector: VersionVector
  readonly acceptedChangeIds: readonly string[]
}

export type SyncMessage = SyncHello | SyncChanges | SyncAck

export const maxSyncFrameBytes = 4 * 1024 * 1024

export interface SyncChange {
  readonly id: string
  readonly deviceId: DeviceId
  readonly sequence: number
  readonly kind: 'note-update' | 'learning-mutation'
  readonly payload: string
}

export function normalizeVersionVector(vector: VersionVector): VersionVector {
  const normalized: Record<string, number> = {}
  for (const [deviceId, sequence] of Object.entries(vector)) {
    if (!deviceId || !Number.isSafeInteger(sequence) || sequence < 0)
      throw new TypeError('Version vector entries must contain non-negative safe integers')
    if (sequence > 0)
      normalized[deviceId] = sequence
  }
  return normalized
}

export function mergeVersionVectors(...vectors: VersionVector[]): VersionVector {
  const merged: Record<string, number> = {}
  for (const vector of vectors) {
    for (const [deviceId, sequence] of Object.entries(normalizeVersionVector(vector))) {
      merged[deviceId] = Math.max(merged[deviceId] ?? 0, sequence)
    }
  }
  return merged
}

export function compareVersionVectors(left: VersionVector, right: VersionVector): 'equal' | 'left-dominates' | 'right-dominates' | 'concurrent' {
  const keys = new Set([...Object.keys(left), ...Object.keys(right)])
  let leftAtLeast = true
  let rightAtLeast = true
  let leftGreater = false
  let rightGreater = false
  for (const key of keys) {
    const a = left[key] ?? 0
    const b = right[key] ?? 0
    if (a < b)
      leftAtLeast = false
    if (b < a)
      rightAtLeast = false
    if (a > b)
      leftGreater = true
    if (b > a)
      rightGreater = true
  }
  if (!leftGreater && !rightGreater)
    return 'equal'
  if (leftAtLeast)
    return 'left-dominates'
  if (rightAtLeast)
    return 'right-dominates'
  return 'concurrent'
}

export function missingSequences(local: VersionVector, remote: VersionVector): VersionVector {
  const missing: Record<string, number> = {}
  for (const [deviceId, remoteSequence] of Object.entries(normalizeVersionVector(remote))) {
    const localSequence = local[deviceId] ?? 0
    if (remoteSequence > localSequence)
      missing[deviceId] = remoteSequence
  }
  return missing
}

export function encodeMessage(message: SyncMessage): Uint8Array {
  const payload = new TextEncoder().encode(JSON.stringify(message))
  if (payload.byteLength > maxSyncFrameBytes)
    throw new RangeError('Memorilo sync message exceeds the maximum frame size')
  const framed = new Uint8Array(4 + payload.byteLength)
  new DataView(framed.buffer).setUint32(0, payload.byteLength)
  framed.set(payload, 4)
  return framed
}

export function decodeMessage(data: Uint8Array): SyncMessage {
  let message: unknown
  try {
    const payload = data.byteLength >= 4
      && new DataView(data.buffer, data.byteOffset, 4).getUint32(0) === data.byteLength - 4
      ? data.slice(4)
      : data
    message = JSON.parse(new TextDecoder().decode(payload).trim())
  }
  catch (error) {
    throw new TypeError('Invalid Memorilo sync message', { cause: error })
  }
  if (typeof message !== 'object' || message === null || !('type' in message))
    throw new TypeError('Memorilo sync message must be an object with a type')
  const type = (message as { type?: unknown }).type
  if (type !== 'hello' && type !== 'changes' && type !== 'ack')
    throw new TypeError(`Unsupported Memorilo sync message type: ${String(type)}`)
  return message as SyncMessage
}

export function encodePairingMessage(message: PairingMessage): Uint8Array {
  const payload = new TextEncoder().encode(JSON.stringify(message))
  if (payload.byteLength > maxSyncFrameBytes)
    throw new RangeError('Memorilo pairing message exceeds the maximum frame size')
  const framed = new Uint8Array(4 + payload.byteLength)
  new DataView(framed.buffer).setUint32(0, payload.byteLength)
  framed.set(payload, 4)
  return framed
}

export function decodePairingMessage(data: Uint8Array): PairingMessage {
  let message: unknown
  try {
    const payload = data.byteLength >= 4
      && new DataView(data.buffer, data.byteOffset, 4).getUint32(0) === data.byteLength - 4
      ? data.slice(4)
      : data
    message = JSON.parse(new TextDecoder().decode(payload).trim())
  }
  catch (error) {
    throw new TypeError('Invalid Memorilo pairing message', { cause: error })
  }
  if (typeof message !== 'object' || message === null || !('type' in message))
    throw new TypeError('Memorilo pairing message must be an object with a type')
  const type = (message as { type?: unknown }).type
  if (type !== 'pairing-probe' && type !== 'pairing-available' && type !== 'pairing-request' && type !== 'pairing-approval' && type !== 'pairing-confirmation' && type !== 'pairing-rejected')
    throw new TypeError(`Unsupported Memorilo pairing message type: ${String(type)}`)
  return message as PairingMessage
}
