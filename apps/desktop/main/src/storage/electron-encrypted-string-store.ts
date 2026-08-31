import type { Buffer } from 'node:buffer'
import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { safeStorage } from 'electron'

export class ElectronEncryptedStringStore {
  constructor(
    readonly path: string,
    readonly description: string,
  ) {}

  async load(): Promise<string | null> {
    let encrypted: Buffer
    try {
      encrypted = await readFile(this.path)
    }
    catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT')
        return null
      throw error
    }
    this.#requireEncryption()
    return safeStorage.decryptString(encrypted)
  }

  async save(value: string): Promise<void> {
    if (value.length === 0)
      throw new TypeError(`${this.description} must not be empty`)
    this.#requireEncryption()
    await mkdir(dirname(this.path), { recursive: true, mode: 0o700 })
    const temporaryPath = `${this.path}.tmp-${randomUUID()}`
    await writeFile(temporaryPath, safeStorage.encryptString(value), { flag: 'wx', mode: 0o600 })
    await rename(temporaryPath, this.path)
  }

  async clear(): Promise<void> {
    try {
      await unlink(this.path)
    }
    catch (error) {
      if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT'))
        throw error
    }
  }

  #requireEncryption(): void {
    if (!safeStorage.isEncryptionAvailable())
      throw new Error(`Operating-system encryption is unavailable for the ${this.description}`)
  }
}
