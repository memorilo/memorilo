export type ShelfSourceKind = 'opds'

export interface ShelfSource {
  addedAt: number
  auth: 'basic' | 'none'
  enabled: boolean
  id: string
  kind: ShelfSourceKind
  name: string
  orderKey: string
  updatedAt: number
  url: string
  username: string | null
}

export interface AddShelfSourceInput {
  name?: string
  password?: string
  url: string
  username?: string
}

export interface UpdateShelfSourceInput {
  clearCredentials?: boolean
  id: string
  name: string
  password?: string
  url: string
  username?: string
}

export interface BrowseShelfInput {
  pageUrl?: string
  sourceId?: string
}

export interface ShelfNavigationItem {
  href: string
  subtitle: string | null
  title: string
}

export interface ShelfPublicationLink {
  href: string
  rel: string
  type: string | null
}

export interface ShelfPublication {
  authors: readonly string[]
  coverUrl: string | null
  id: string
  links: readonly ShelfPublicationLink[]
  section: string | null
  subtitle: string | null
  summary: string | null
  title: string
}

export interface ShelfPage {
  nextUrl: string | null
  navigation: readonly ShelfNavigationItem[]
  publications: readonly ShelfPublication[]
  selfUrl: string
  subtitle: string | null
  title: string
}

export interface CachedShelfPage {
  etag: string | null
  fetchedAt: number
  lastModified: string | null
  page: ShelfPage
  sourceId: string
  url: string
}

export interface CachedShelfAsset {
  bytes: Uint8Array
  etag: string | null
  fetchedAt: number
  lastModified: string | null
  mimeType: string
  sourceId: string
  url: string
}

export interface StoredShelfSource extends ShelfSource {
  encryptedPassword: Uint8Array | null
  fieldClocks: ShelfSourceFieldClocks
}

export type ShelfSourceField = 'auth' | 'deleted' | 'enabled' | 'name' | 'orderKey' | 'url' | 'username'

export type ShelfSourceFieldClocks = Readonly<Record<ShelfSourceField, string>>

export interface ShelfSourceOperation {
  actorId: string
  clock: string
  fields: Readonly<Partial<{
    auth: ShelfSource['auth']
    deleted: boolean
    enabled: boolean
    name: string
    orderKey: string
    url: string
    username: string | null
  }>>
  id: string
  sourceId: string
}

export interface SaveShelfSourceInput {
  encryptedPassword: Uint8Array | null
  source: ShelfSource
}

export interface ShelfStorage {
  acknowledgeOperations: (operationIds: readonly string[]) => Promise<void>
  deleteSource: (sourceId: string) => Promise<void>
  getCachedPage: (sourceId: string, url: string) => Promise<CachedShelfPage | null>
  getSource: (sourceId: string) => Promise<StoredShelfSource | null>
  listPendingOperations: (limit?: number) => Promise<readonly ShelfSourceOperation[]>
  listSources: () => Promise<readonly StoredShelfSource[]>
  mergeOperations: (operations: readonly ShelfSourceOperation[]) => Promise<void>
  savePage: (page: CachedShelfPage) => Promise<void>
  saveSource: (input: SaveShelfSourceInput) => Promise<void>
}

export interface ShelfImageCache {
  deleteSource: (sourceId: string) => Promise<void>
  get: (sourceId: string, url: string) => Promise<CachedShelfAsset | null>
  save: (asset: CachedShelfAsset) => Promise<void>
}

export interface ShelfBrowseIssue {
  kind: 'authentication' | 'network' | 'parse' | 'response'
  message: string
}

export interface ShelfBrowseGroup {
  issue: ShelfBrowseIssue | null
  page: ShelfPage | null
  source: ShelfSource
}

export interface ShelfBrowseResult {
  groups: readonly ShelfBrowseGroup[]
  refreshedAt: number | null
}

export interface ShelfAssetResult {
  bytes: Uint8Array
  mimeType: string
}

export interface ShelfAssetInput {
  sourceId: string
  url: string
}
