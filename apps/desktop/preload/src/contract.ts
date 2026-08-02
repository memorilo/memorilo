import type { DesktopConfiguration } from '@memorilo/desktop-config/contract'

export type { DesktopConfiguration } from '@memorilo/desktop-config/contract'

export interface RuntimeInfo {
  platform: string
  version: string
}

export interface DesktopTopicBlock {
  attributes: Readonly<Record<string, unknown>>
  id: string
  kind: string
  ordinal: number
  parentId: string | null
  text: string
}

export interface DesktopNote {
  createdAt: number
  favorite: boolean
  id: string
  snapshot: Uint8Array
  title: string
  updatedAt: number
}

export interface CreateDesktopNoteInput {
  initialHeading?: string
  title?: string
}

export interface GetDesktopNoteInput {
  noteId: string
}

export interface ListDesktopNotesInput {
  page?: number
  pageSize?: number
  sortBy?: DesktopNoteSortField
  sortDirection?: DesktopNoteSortDirection
}

export type DesktopNoteSortDirection = 'asc' | 'desc'

export type DesktopNoteSortField = 'createdAt' | 'title' | 'updatedAt'

export interface RenameDesktopNoteInput {
  noteId: string
  title: string
}

export interface DesktopNoteSummary {
  createdAt: number
  favorite: boolean
  id: string
  title: string
  updatedAt: number
}

export interface DesktopFavoriteNoteItem {
  favoritedAt: number
  noteId: string
  noteTitle: string
  topicId: string
  topicTitle: string
}

export interface DesktopRecentNoteItem {
  noteId: string
  noteTitle: string
  openedAt: number
  topicId: string
  topicTitle: string
}

export interface SetDesktopNoteFavoriteInput {
  favorite: boolean
  noteId: string
}

export type DesktopNoteFavoriteState = SetDesktopNoteFavoriteInput

export interface RecordDesktopNoteOpenedInput {
  noteId: string
  topicId: string
}

export type RenameDesktopNoteResult
  = | { note: DesktopNoteSummary, status: 'renamed' }
    | { status: 'duplicate-title' }

export interface DesktopNotePage {
  items: readonly DesktopNoteSummary[]
  page: number
  pageSize: number
  totalItems: number
  totalPages: number
}

export interface DesktopColumnVisibilityMenuItem {
  canToggle: boolean
  id: string
  label: string
  visible: boolean
}

export interface ShowDesktopColumnVisibilityMenuInput {
  anchor: {
    x: number
    y: number
  }
  columns: readonly DesktopColumnVisibilityMenuItem[]
}

export interface DesktopColumnVisibilityMenuSelection {
  columnId: string
}

export interface SaveDesktopNoteUpdatesInput {
  noteId: string
  updates: readonly Uint8Array[]
}

export interface DesktopNoteWriteReceipt {
  updatedAt: number
}

export interface DesktopNoteExternalUpdate {
  noteId: string
  update: Uint8Array
  updatedAt: number
}

export interface DesktopStoredTopicBlock extends DesktopTopicBlock {
  contentHash: string
  noteId: string
  topicId: string
}

export interface DesktopTopicBlockSearchHit extends DesktopStoredTopicBlock {
  preview: string
  rank: number
}

export type DesktopTopicBlockSearchMode = 'hybrid' | 'lexical' | 'semantic'

export type DesktopNoteSearchMatch = 'content' | 'node-start' | 'semantic' | 'title'

export interface DesktopNoteTitleSearchHit {
  kind: 'note'
  match: 'title'
  noteId: string
  noteTitle: string
  preview: string
  rank: number
}

export interface DesktopTopicSearchHit {
  blockId: string | null
  kind: 'topic'
  match: DesktopNoteSearchMatch
  noteId: string
  noteTitle: string
  preview: string
  rank: number
  topicId: string
  topicTitle: string
}

export type DesktopNoteSearchHit = DesktopNoteTitleSearchHit | DesktopTopicSearchHit

export interface DesktopApi {
  createNote: (input?: CreateDesktopNoteInput) => Promise<DesktopNote>
  getConfiguration: () => Promise<DesktopConfiguration>
  getNote: (input: GetDesktopNoteInput) => Promise<DesktopNote>
  getRuntimeInfo: () => Promise<RuntimeInfo>
  getTopicBlock: (input: { blockId: string, noteId: string, topicId: string }) => Promise<DesktopStoredTopicBlock | null>
  listFavoriteNotes: (input?: { limit?: number }) => Promise<readonly DesktopFavoriteNoteItem[]>
  listNotes: (input?: ListDesktopNotesInput) => Promise<DesktopNotePage>
  listRecentNotes: (input?: { limit?: number }) => Promise<readonly DesktopRecentNoteItem[]>
  openMostRecentNote: () => Promise<DesktopNote>
  recordNoteOpened: (input: RecordDesktopNoteOpenedInput) => Promise<void>
  renameNote: (input: RenameDesktopNoteInput) => Promise<RenameDesktopNoteResult>
  saveNoteUpdates: (input: SaveDesktopNoteUpdatesInput) => Promise<DesktopNoteWriteReceipt>
  searchNotes: (input: {
    limit?: number
    query: string
  }) => Promise<readonly DesktopNoteSearchHit[]>
  searchTopicBlocks: (input: {
    limit?: number
    mode?: DesktopTopicBlockSearchMode
    noteId?: string
    query: string
  }) => Promise<readonly DesktopTopicBlockSearchHit[]>
  setNoteFavorite: (input: SetDesktopNoteFavoriteInput) => Promise<DesktopNoteFavoriteState>
  setConfiguration: (configuration: DesktopConfiguration) => Promise<DesktopConfiguration>
  showColumnVisibilityMenu: (
    input: ShowDesktopColumnVisibilityMenuInput,
  ) => Promise<DesktopColumnVisibilityMenuSelection | null>
  subscribeConfiguration: (listener: (configuration: DesktopConfiguration) => void) => () => void
  subscribeNoteUpdates: (listener: (update: DesktopNoteExternalUpdate) => void) => () => void
}
