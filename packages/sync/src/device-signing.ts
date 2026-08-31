import type { DeviceSigner, DeviceSigningKeyStore } from './device-signing-contract'
import { Buffer } from 'node:buffer'
import {
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  randomUUID,
  sign as signBytes,
  verify as verifyBytes,
} from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

export type { DeviceSigner, DeviceSigningKeyStore } from './device-signing-contract'

export class JsonDeviceSigningKeyStore implements DeviceSigningKeyStore {
  constructor(readonly path: string) {}

  async load(): Promise<string | null> {
    try {
      const value: unknown = JSON.parse(await readFile(this.path, 'utf8'))
      if (typeof value !== 'object' || value === null || !('privateKey' in value) || typeof value.privateKey !== 'string' || value.privateKey.length === 0)
        throw new TypeError('Device signing key file is invalid')
      return value.privateKey
    }
    catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT')
        return null
      throw error
    }
  }

  async save(privateKey: string): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true })
    const temporaryPath = `${this.path}.tmp-${randomUUID()}`
    await writeFile(temporaryPath, `${JSON.stringify({ privateKey })}\n`, { encoding: 'utf8', flag: 'wx', mode: 0o600 })
    await rename(temporaryPath, this.path)
  }
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'string')
    return JSON.stringify(value)
  if (typeof value === 'number') {
    if (!Number.isFinite(value))
      throw new TypeError('Device signature payload numbers must be finite')
    return JSON.stringify(value)
  }
  if (Array.isArray(value))
    return `[${value.map(canonicalJson).join(',')}]`
  if (typeof value !== 'object')
    throw new TypeError('Device signature payload must contain only JSON values')
  const record = value as Record<string, unknown>
  return `{${Object.keys(record).sort().map(key => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(',')}}`
}

export function deviceSignaturePayload(purpose: string, value: unknown): Uint8Array {
  if (purpose.length === 0)
    throw new TypeError('Device signature purpose must not be empty')
  return new TextEncoder().encode(`memorilo:${purpose}:v1\n${canonicalJson(value)}`)
}

export function createDeviceSigner(encodedPrivateKey?: string): DeviceSigner {
  const privateKey = encodedPrivateKey === undefined
    ? generateKeyPairSync('ed25519').privateKey
    : createPrivateKey({
        format: 'der',
        key: Buffer.from(encodedPrivateKey, 'base64url'),
        type: 'pkcs8',
      })
  if (privateKey.asymmetricKeyType !== 'ed25519')
    throw new TypeError('Device signing key must be Ed25519')
  const publicKey = createPublicKey(privateKey).export({ format: 'der', type: 'spki' }).toString('base64url')
  return {
    publicKey,
    sign: payload => signBytes(null, payload, privateKey).toString('base64url'),
  }
}

export function generateDeviceSigningPrivateKey(): string {
  return generateKeyPairSync('ed25519').privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64url')
}

export async function loadOrCreateDeviceSigner(store: DeviceSigningKeyStore): Promise<DeviceSigner> {
  const stored = await store.load()
  if (stored !== null)
    return createDeviceSigner(stored)
  const privateKey = generateDeviceSigningPrivateKey()
  await store.save(privateKey)
  return createDeviceSigner(privateKey)
}

export function signDevicePayload(signer: DeviceSigner, purpose: string, value: unknown): string {
  return signer.sign(deviceSignaturePayload(purpose, value))
}

export function withoutDeviceSignature<Value extends { readonly signature: string }>(value: Value): Omit<Value, 'signature'> {
  return Object.fromEntries(Object.entries(value).filter(([key]) => key !== 'signature')) as Omit<Value, 'signature'>
}

export function verifyDevicePayload(publicKey: string, purpose: string, value: unknown, signature: string): boolean {
  try {
    const key = createPublicKey({
      format: 'der',
      key: Buffer.from(publicKey, 'base64url'),
      type: 'spki',
    })
    return key.asymmetricKeyType === 'ed25519'
      && verifyBytes(null, deviceSignaturePayload(purpose, value), key, Buffer.from(signature, 'base64url'))
  }
  catch {
    return false
  }
}
