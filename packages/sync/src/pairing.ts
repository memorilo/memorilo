import type { DeviceSigner } from './device-signing'
import type { DeviceId, PairedDevice, PairingInvitation, PairingResponse, SyncPeerRole } from './model'
import type { LocalDeviceIdentity, PairingStore } from './pairing-contract'
import { Buffer } from 'node:buffer'
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { createDeviceSigner, signDevicePayload, verifyDevicePayload } from './device-signing'

export type { LocalDeviceIdentity, PairingStore } from './pairing-contract'

export class MemoryPairingStore implements PairingStore {
  #devices: readonly PairedDevice[] = []

  constructor(devices: readonly PairedDevice[] = []) {
    this.#devices = devices
  }

  async load(): Promise<readonly PairedDevice[]> {
    return this.#devices.map(device => ({ ...device }))
  }

  async save(devices: readonly PairedDevice[]): Promise<void> {
    this.#devices = devices.map(device => ({ ...device }))
  }
}

export class JsonPairingStore implements PairingStore {
  constructor(readonly path: string) {}

  async load(): Promise<readonly PairedDevice[]> {
    try {
      const value: unknown = JSON.parse(await readFile(this.path, 'utf8'))
      if (!Array.isArray(value))
        throw new TypeError('Pairing file must contain an array')
      return value as PairedDevice[]
    }
    catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT')
        return []
      throw error
    }
  }

  async save(devices: readonly PairedDevice[]): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true })
    const temporaryPath = `${this.path}.tmp-${randomUUID()}`
    await writeFile(temporaryPath, `${JSON.stringify(devices)}\n`, { encoding: 'utf8', flag: 'wx' })
    await rename(temporaryPath, this.path)
  }
}

export interface PairingGrant {
  readonly pairingId: string
  readonly deviceId: DeviceId
  readonly deviceName: string
  readonly peerId: string
  readonly role: SyncPeerRole
  readonly sharedSecret: string
  readonly signingPublicKey: string
}

export function verifyPairingInvitation(invitation: PairingInvitation): boolean {
  const { signature, ...unsigned } = invitation
  return verifyDevicePayload(invitation.signingPublicKey, 'pairing-invitation', unsigned, signature)
}

export function verifyPairingResponse(response: PairingResponse): boolean {
  const { signature, ...unsigned } = response
  return verifyDevicePayload(response.signingPublicKey, 'pairing-response', unsigned, signature)
}

const pairingEmoji = [
  '😀',
  '😎',
  '🥳',
  '🤖',
  '👻',
  '🐶',
  '🐱',
  '🦊',
  '🐼',
  '🐸',
  '🦄',
  '🐙',
  '🦋',
  '🌈',
  '⭐',
  '🌙',
  '☀',
  '🔥',
  '🍀',
  '🍎',
  '🍉',
  '🍋',
  '🍇',
  '🥨',
  '⚽',
  '🎲',
  '🎵',
  '🚀',
  '🛸',
  '🏠',
  '💡',
  '💎',
] as const

export function pairingEmojiForSecret(sharedSecret: string): string {
  if (sharedSecret.length === 0)
    throw new TypeError('Pairing shared secret must not be empty')
  const digest = createHash('sha256').update(sharedSecret).digest()
  return Array.from({ length: 5 }, (_, index) => pairingEmoji[digest[index]! % pairingEmoji.length]).join('')
}

export class PairingManager {
  #devices: PairedDevice[] = []

  constructor(
    readonly identity: LocalDeviceIdentity,
    readonly store: PairingStore,
    readonly now: () => number = Date.now,
    readonly signer: DeviceSigner = createDeviceSigner(),
  ) {}

  async load(): Promise<void> {
    this.#devices = (await this.store.load()).map(device => ({ ...device }))
  }

  list(): readonly PairedDevice[] {
    return this.#devices.map(device => ({ ...device }))
  }

  createInvitation(ttlMs = 10 * 60 * 1000, membershipEpoch = validMembershipEpoch(this.identity.membershipEpoch)): string {
    if (!Number.isSafeInteger(ttlMs) || ttlMs <= 0)
      throw new RangeError('Pairing invitation TTL must be positive')
    if (!Number.isSafeInteger(membershipEpoch) || membershipEpoch < 1)
      throw new RangeError('Pairing membership epoch must be positive')
    const now = this.now()
    const unsigned: Omit<PairingInvitation, 'signature'> = {
      version: 1,
      pairingId: randomUUID(),
      deviceId: this.identity.deviceId,
      deviceName: this.identity.deviceName,
      peerId: this.identity.peerId,
      role: this.identity.role ?? 'device',
      sharedSecret: randomBytes(32).toString('base64url'),
      signingPublicKey: this.signer.publicKey,
      membershipEpoch,
      createdAt: now,
      expiresAt: now + ttlMs,
    }
    const invitation: PairingInvitation = {
      ...unsigned,
      signature: signDevicePayload(this.signer, 'pairing-invitation', unsigned),
    }
    return encodePairingPayload(invitation)
  }

  async acceptInvitation(encoded: string): Promise<{ response: string, device: PairedDevice }> {
    const invitation = decodePairingPayload<PairingInvitation>(encoded)
    if (invitation.version !== 1 || invitation.expiresAt <= this.now())
      throw new Error('Pairing invitation has expired')
    if (!isInvitation(invitation) || !verifyPairingInvitation(invitation))
      throw new TypeError('Pairing invitation is incomplete')
    const device = this.makeDevice(invitation.pairingId, invitation.deviceId, invitation.deviceName, invitation.peerId, invitation.role, invitation.sharedSecret, invitation.signingPublicKey)
    await this.upsert(device)
    const unsigned: Omit<PairingResponse, 'signature'> = {
      version: 1,
      pairingId: invitation.pairingId,
      deviceId: this.identity.deviceId,
      deviceName: this.identity.deviceName,
      peerId: this.identity.peerId,
      role: this.identity.role ?? 'device',
      sharedSecret: invitation.sharedSecret,
      signingPublicKey: this.signer.publicKey,
      membershipEpoch: Math.max(invitation.membershipEpoch, validMembershipEpoch(this.identity.membershipEpoch)),
    }
    const response: PairingResponse = {
      ...unsigned,
      signature: signDevicePayload(this.signer, 'pairing-response', unsigned),
    }
    return { device, response: encodePairingPayload(response) }
  }

  async completeInvitation(
    encoded: string,
    options: { readonly persist?: boolean } = {},
  ): Promise<PairedDevice> {
    const response = decodePairingPayload<PairingResponse>(encoded)
    if (!isResponse(response) || !verifyPairingResponse(response) || response.deviceId === this.identity.deviceId)
      throw new TypeError('Pairing response is incomplete')
    const device = this.makeDevice(response.pairingId, response.deviceId, response.deviceName, response.peerId, response.role, response.sharedSecret, response.signingPublicKey)
    return options.persist === false ? device : this.upsert(device)
  }

  async completeGrant(grant: PairingGrant): Promise<PairedDevice> {
    if (!isNonEmptyString(grant.pairingId) || !isNonEmptyString(grant.deviceId)
      || !isNonEmptyString(grant.deviceName) || !isNonEmptyString(grant.peerId)
      || !isNonEmptyString(grant.sharedSecret) || !isNonEmptyString(grant.signingPublicKey)) {
      throw new TypeError('Pairing grant is incomplete')
    }
    return this.upsert(this.makeDevice(
      grant.pairingId,
      grant.deviceId,
      grant.deviceName,
      grant.peerId,
      grant.role,
      grant.sharedSecret,
      grant.signingPublicKey,
    ))
  }

  async remove(deviceId: DeviceId): Promise<void> {
    this.#devices = this.#devices.filter(device => device.deviceId !== deviceId)
    await this.store.save(this.#devices)
  }

  findByPeerId(peerId: string): PairedDevice | undefined {
    return this.#devices.find(device => device.peerId === peerId)
  }

  findByDeviceId(deviceId: DeviceId): PairedDevice | undefined {
    return this.#devices.find(device => device.deviceId === deviceId)
  }

  async markSeen(peerId: string): Promise<void> {
    const device = this.findByPeerId(peerId)
    if (!device)
      return
    const updated = { ...device, lastSeenAt: this.now() }
    this.#devices = this.#devices.map(current => current.deviceId === device.deviceId ? updated : current)
    await this.store.save(this.#devices)
  }

  async updateDeviceName(peerId: string, deviceName: string): Promise<void> {
    const device = this.findByPeerId(peerId)
    const normalized = deviceName.trim()
    if (!device || normalized.length === 0 || normalized.length > 80 || /\p{Cc}/u.test(normalized) || device.deviceName === normalized)
      return
    this.#devices = this.#devices.map(current => current.deviceId === device.deviceId ? { ...current, deviceName: normalized } : current)
    await this.store.save(this.#devices)
  }

  private makeDevice(pairingId: string, deviceId: string, deviceName: string, peerId: string, role: SyncPeerRole, sharedSecret: string, signingPublicKey: string): PairedDevice {
    return {
      addedAt: this.now(),
      deviceId,
      deviceName: deviceName || 'Memorilo device',
      lastSeenAt: null,
      pairingId,
      peerId,
      role,
      sharedSecret,
      signingPublicKey,
    }
  }

  private async upsert(device: PairedDevice): Promise<PairedDevice> {
    this.#devices = [...this.#devices.filter(current => current.deviceId !== device.deviceId), device]
    await this.store.save(this.#devices)
    return device
  }
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

function isInvitation(value: PairingInvitation): value is PairingInvitation {
  return value.version === 1
    && isNonEmptyString(value.pairingId)
    && isNonEmptyString(value.deviceId)
    && isNonEmptyString(value.deviceName)
    && isNonEmptyString(value.peerId)
    && (value.role === 'device' || value.role === 'server')
    && isNonEmptyString(value.sharedSecret)
    && isNonEmptyString(value.signingPublicKey)
    && isNonEmptyString(value.signature)
    && Number.isSafeInteger(value.membershipEpoch)
    && value.membershipEpoch > 0
    && Number.isSafeInteger(value.createdAt)
    && Number.isSafeInteger(value.expiresAt)
    && value.expiresAt > value.createdAt
}

function isResponse(value: PairingResponse): value is PairingResponse {
  return value.version === 1
    && isNonEmptyString(value.pairingId)
    && isNonEmptyString(value.deviceId)
    && isNonEmptyString(value.deviceName)
    && isNonEmptyString(value.peerId)
    && (value.role === 'device' || value.role === 'server')
    && isNonEmptyString(value.sharedSecret)
    && isNonEmptyString(value.signingPublicKey)
    && isNonEmptyString(value.signature)
    && Number.isSafeInteger(value.membershipEpoch)
    && value.membershipEpoch > 0
}

function validMembershipEpoch(value: number | undefined): number {
  return Number.isSafeInteger(value) && (value as number) > 0 ? value as number : 1
}

export function encodePairingPayload(payload: PairingInvitation | PairingResponse): string {
  return `memorilo-pair-v1.${Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url')}`
}

export function decodePairingPayload<T extends PairingInvitation | PairingResponse>(encoded: string): T {
  const prefix = 'memorilo-pair-v1.'
  if (!encoded.startsWith(prefix))
    throw new TypeError('Unsupported pairing code')
  let payload: unknown
  try {
    payload = JSON.parse(Buffer.from(encoded.slice(prefix.length), 'base64url').toString('utf8'))
  }
  catch (error) {
    throw new TypeError('Invalid pairing code', { cause: error })
  }
  if (typeof payload !== 'object' || payload === null)
    throw new TypeError('Pairing code payload must be an object')
  return payload as T
}
