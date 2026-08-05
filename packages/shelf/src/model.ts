import type { ReadingFormat } from '@memorilo/reading-format'
import type { BookFileBinding } from '@memorilo/reading-model'

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

export interface ShelfPublicationContributor {
  name: string
  role: string
}

export interface ShelfPublicationCollection {
  name: string
  position: number | null
  type: 'collection' | 'series'
}

export interface ShelfPublicationSubject {
  code: string | null
  name: string
  scheme: string | null
}

export interface ShelfPublicationMetadata {
  accessibilityFeatures: readonly string[]
  accessibilityHazards: readonly string[]
  accessibilityModes: readonly string[]
  accessibilitySummary: string | null
  collections: readonly ShelfPublicationCollection[]
  conformsTo: readonly string[]
  contributors: readonly ShelfPublicationContributor[]
  duration: number | null
  identifiers: readonly string[]
  imprints: readonly string[]
  languages: readonly string[]
  modified: string | null
  numberOfPages: number | null
  published: string | null
  publishers: readonly string[]
  readingProgression: string | null
  rights: string | null
  subjects: readonly ShelfPublicationSubject[]
  types: readonly string[]
}

export interface ShelfPublication {
  authors: readonly string[]
  coverUrl: string | null
  id: string
  links: readonly ShelfPublicationLink[]
  metadata?: ShelfPublicationMetadata
  section: string | null
  subtitle: string | null
  summary: string | null
  title: string
}

export interface ShelfPublicationDetailsInput {
  publicationId: string
  sourceId: string
}

export interface ShelfPublicationDetails {
  publication: ShelfPublication
  readingOptions: readonly ShelfReadingOption[]
  source: ShelfSource
}

export type ShelfReadingFormat = ReadingFormat

export type ShelfReadingRetention = 'cache' | 'library'

export interface ShelfReadingOption {
  format: ShelfReadingFormat
  mediaType: string
  readingId: string
  savedLocally: boolean
}

export interface PrepareShelfReadingInput {
  format: ShelfReadingFormat
  publicationId: string
  retention: ShelfReadingRetention
  sourceId: string
}

export interface PreparedShelfReading {
  book: BookFileBinding
  readingId: string
}

export interface OpenShelfReadingInput {
  readingId: string
}

export interface ShelfReadingRangeInput {
  length: number
  offset: number
  readingId: string
}

export interface ShelfReadingDocument {
  book: BookFileBinding
  byteLength: number
  format: ShelfReadingFormat
  name: string
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
  getCachedPublication: (sourceId: string, publicationId: string) => Promise<ShelfPublication | null>
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
