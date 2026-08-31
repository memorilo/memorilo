import { Buffer } from 'node:buffer'
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ encryptionAvailable: true }))

vi.mock('electron', () => ({
  safeStorage: {
    decryptString: (encrypted: Uint8Array) => Buffer.from(Buffer.from(encrypted).toString('utf8'), 'base64').toString('utf8'),
    encryptString: (value: string) => Buffer.from(Buffer.from(value, 'utf8').toString('base64'), 'utf8'),
    isEncryptionAvailable: () => mocks.encryptionAvailable,
  },
}))

const { ElectronSyncServerCredentialStore } = await import('./electron-sync-server-credential-store')

describe('electron Sync Server credential store', () => {
  const directories: string[] = []

  afterEach(async () => {
    mocks.encryptionAvailable = true
    await Promise.all(directories.splice(0).map(directory => rm(directory, { force: true, recursive: true })))
  })

  it('stores an encrypted credential with owner-only permissions and can clear it', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'memorilo-sync-credential-'))
    directories.push(directory)
    const path = join(directory, 'credential.enc')
    const store = new ElectronSyncServerCredentialStore(path)

    await store.save('device-credential-value')

    expect(await readFile(path, 'utf8')).not.toContain('device-credential-value')
    expect((await stat(path)).mode & 0o777).toBe(0o600)
    await expect(store.load()).resolves.toBe('device-credential-value')
    await store.clear()
    await expect(store.load()).resolves.toBeNull()
  })

  it('refuses to persist a credential when operating-system encryption is unavailable', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'memorilo-sync-credential-'))
    directories.push(directory)
    const store = new ElectronSyncServerCredentialStore(join(directory, 'credential.enc'))
    mocks.encryptionAvailable = false

    await expect(store.save('device-credential-value')).rejects.toThrow('Operating-system encryption is unavailable')
  })
})
