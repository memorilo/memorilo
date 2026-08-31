import { ElectronEncryptedStringStore } from './electron-encrypted-string-store'

export interface SyncServerCredentialStore {
  readonly clear: () => Promise<void>
  readonly load: () => Promise<string | null>
  readonly save: (credential: string) => Promise<void>
}

export class ElectronSyncServerCredentialStore implements SyncServerCredentialStore {
  readonly #store: ElectronEncryptedStringStore

  constructor(readonly path: string) {
    this.#store = new ElectronEncryptedStringStore(path, 'Sync Server device credential')
  }

  clear = (): Promise<void> => this.#store.clear()

  load = (): Promise<string | null> => this.#store.load()

  save = (credential: string): Promise<void> => this.#store.save(credential)
}
