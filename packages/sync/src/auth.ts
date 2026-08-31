export interface SyncAccount {
  readonly accountId: string
  readonly username: string
  readonly passwordHash: string
  readonly createdAt: number
}

export interface SyncSession {
  readonly tokenHash: string
  readonly accountId: string
  readonly csrfToken: string
  readonly expiresAt: number
  readonly createdAt: number
}

export interface SyncInvite {
  readonly tokenHash: string
  readonly createdAt: number
  readonly expiresAt: number
  readonly revokedAt: number | null
  readonly consumedAt: number | null
}

export interface SyncDeviceCredential {
  readonly accountId: string
  readonly deviceId: string
  readonly deviceName: string
  readonly peerId: string
  readonly pairingId: string
  readonly sharedSecretHash: string
  readonly signingPublicKey: string
  readonly membershipEpoch: number
  readonly scopes: readonly ('sync' | 'object')[]
  readonly credentialHash: string
  readonly createdAt: number
  readonly expiresAt: number
  readonly revokedAt: number | null
}

export interface SyncServerCredentialBundle {
  readonly version: 1
  readonly credential: string
  readonly peerId: string
  readonly generation: number
  readonly membershipEpoch: number
  readonly policyEpoch: number
  readonly modes: readonly ('relay' | 'authoritative')[]
}

const syncServerCredentialPrefix = 'memorilo-sync-credential-v1.'
const base64UrlAlphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'

function encodeBase64Url(value: string): string {
  const bytes = new TextEncoder().encode(value)
  let result = ''
  let bits = 0
  let bitCount = 0
  for (const byte of bytes) {
    bits = (bits << 8) | byte
    bitCount += 8
    while (bitCount >= 6) {
      bitCount -= 6
      result += base64UrlAlphabet[(bits >>> bitCount) & 0x3F]
    }
  }
  if (bitCount > 0)
    result += base64UrlAlphabet[(bits << (6 - bitCount)) & 0x3F]
  return result
}

function decodeBase64Url(value: string): string {
  if (!/^[\w-]+$/u.test(value) || value.length % 4 === 1)
    throw new TypeError('Invalid Sync Server credential encoding')
  const bytes: number[] = []
  let bits = 0
  let bitCount = 0
  for (const character of value) {
    const index = base64UrlAlphabet.indexOf(character)
    if (index < 0)
      throw new TypeError('Invalid Sync Server credential encoding')
    bits = (bits << 6) | index
    bitCount += 6
    if (bitCount >= 8) {
      bitCount -= 8
      bytes.push((bits >>> bitCount) & 0xFF)
    }
  }
  if (bitCount > 0 && (bits & ((1 << bitCount) - 1)) !== 0)
    throw new TypeError('Invalid Sync Server credential encoding')
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(bytes))
  }
  catch (error) {
    throw new TypeError('Invalid Sync Server credential encoding', { cause: error })
  }
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0
}

export function encodeSyncServerCredentialBundle(bundle: SyncServerCredentialBundle): string {
  return `${syncServerCredentialPrefix}${encodeBase64Url(JSON.stringify(bundle))}`
}

export function decodeSyncServerCredentialBundle(encoded: string): SyncServerCredentialBundle {
  if (!encoded.startsWith(syncServerCredentialPrefix))
    throw new TypeError('Unsupported Sync Server credential version')
  let value: unknown
  try {
    value = JSON.parse(decodeBase64Url(encoded.slice(syncServerCredentialPrefix.length)))
  }
  catch (error) {
    if (error instanceof TypeError)
      throw error
    throw new TypeError('Invalid Sync Server credential payload', { cause: error })
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new TypeError('Invalid Sync Server credential payload')
  const record = value as Record<string, unknown>
  const expectedKeys = ['credential', 'generation', 'membershipEpoch', 'modes', 'peerId', 'policyEpoch', 'version']
  if (Object.keys(record).sort().join('\0') !== expectedKeys.join('\0')
    || record.version !== 1
    || typeof record.credential !== 'string'
    || record.credential.length < 16
    || typeof record.peerId !== 'string'
    || record.peerId.length === 0
    || !isNonNegativeInteger(record.generation)
    || !isNonNegativeInteger(record.policyEpoch)
    || !Number.isSafeInteger(record.membershipEpoch)
    || (record.membershipEpoch as number) <= 0
    || !Array.isArray(record.modes)
    || record.modes.length === 0
    || record.modes.length > 2
    || !record.modes.every(mode => mode === 'relay' || mode === 'authoritative')
    || new Set(record.modes).size !== record.modes.length) {
    throw new TypeError('Invalid Sync Server credential payload')
  }
  return {
    credential: record.credential,
    generation: record.generation,
    membershipEpoch: record.membershipEpoch as number,
    modes: record.modes,
    peerId: record.peerId,
    policyEpoch: record.policyEpoch,
    version: 1,
  }
}

export interface SyncPairingSession {
  readonly pairingId: string
  readonly accountId: string
  readonly createdAt: number
  readonly expiresAt: number
  readonly consumedAt: number | null
}

export interface SyncAuthStore {
  readonly countAccounts: () => Promise<number>
  /** Creates the tenant, owner credential, and optional invite consumption atomically. */
  readonly provisionAccount: (input: { readonly accountId: string, readonly passwordHash: string, readonly username: string, readonly createdAt: number, readonly enabledModes: readonly ('relay' | 'authoritative')[], readonly inviteTokenHash?: string, readonly requireEmpty?: boolean }) => Promise<SyncAccount>
  readonly findAccountById: (accountId: string) => Promise<SyncAccount | null>
  readonly findAccountByUsername: (username: string) => Promise<SyncAccount | null>
  readonly createDeviceCredential: (input: Omit<SyncDeviceCredential, 'revokedAt'>) => Promise<SyncDeviceCredential>
  /** Atomically records a short-lived request nonce; false means it was already consumed. */
  readonly consumeDeviceNonce: (input: { readonly credentialHash: string, readonly nonceHash: string, readonly createdAt: number, readonly expiresAt: number }) => Promise<boolean>
  readonly findDeviceCredential: (credentialHash: string) => Promise<SyncDeviceCredential | null>
  readonly findDeviceCredentialByDevice: (accountId: string, deviceId: string) => Promise<SyncDeviceCredential | null>
  readonly listDeviceCredentials: (accountId: string) => Promise<readonly SyncDeviceCredential[]>
  /** Atomically revokes one account credential and advances its membership epoch. */
  readonly revokeDeviceCredential: (accountId: string, credentialHash: string, revokedAt: number) => Promise<number | null>
  readonly createPairingSession: (input: Omit<SyncPairingSession, 'consumedAt'>) => Promise<SyncPairingSession>
  readonly findPairingSession: (pairingId: string, accountId: string, now: number) => Promise<SyncPairingSession | null>
  readonly consumePairingSession: (pairingId: string, accountId: string, now: number) => Promise<boolean>
  readonly createInvite: (input: Pick<SyncInvite, 'tokenHash' | 'createdAt' | 'expiresAt'>) => Promise<SyncInvite>
  readonly consumeInvite: (tokenHash: string, now: number) => Promise<boolean>
  readonly createSession: (session: SyncSession) => Promise<void>
  readonly getSession: (tokenHash: string, now: number) => Promise<SyncSession | null>
  readonly revokeSession: (tokenHash: string) => Promise<void>
}
