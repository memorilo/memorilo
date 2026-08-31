import type { DeviceSigningKeyStore } from '@memorilo/sync/node'
import { ElectronEncryptedStringStore } from './electron-encrypted-string-store'

export class ElectronDeviceSigningKeyStore implements DeviceSigningKeyStore {
  readonly #store: ElectronEncryptedStringStore

  constructor(readonly path: string) {
    this.#store = new ElectronEncryptedStringStore(path, 'sync device signing key')
  }

  load = (): Promise<string | null> => this.#store.load()

  save = (privateKey: string): Promise<void> => this.#store.save(privateKey)
}
