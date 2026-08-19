import type {
  ShelfCatalogApplication,
  ShelfCredentialAccess,
  ShelfSourceApplication,
} from '@memorilo/application'
import type { StoredShelfSource } from '@memorilo/shelf'
import * as SecureStore from 'expo-secure-store'

const passwordKeyPrefix = 'memorilo.shelf.password.'

function passwordKey(sourceId: string): string {
  return `${passwordKeyPrefix}${sourceId}`
}

/** Mobile credential adapter: passwords live in the OS keychain, never SQLite. */
export class MobileShelfCredentials implements ShelfCredentialAccess {
  clear(sourceId: string): Promise<void> {
    return SecureStore.deleteItemAsync(passwordKey(sourceId))
  }

  encrypt(_password: string): null {
    return null
  }

  async read(source: StoredShelfSource) {
    if (source.auth === 'none')
      return undefined
    if (!source.username)
      throw new Error(`Shelf source ${source.id} is missing its username`)
    const password = await SecureStore.getItemAsync(passwordKey(source.id))
    if (password === null)
      throw new Error(`Shelf source ${source.id} is missing its saved password`)
    return { password, username: source.username }
  }

  async save(sourceId: string, credentials: { password: string } | undefined): Promise<void> {
    if (!credentials) {
      await this.clear(sourceId)
      return
    }
    await SecureStore.setItemAsync(passwordKey(sourceId), credentials.password)
  }
}

export interface MobileShelfRuntime {
  catalog: ShelfCatalogApplication
  sources: ShelfSourceApplication
}
