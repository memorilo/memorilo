import type {
  AddShelfSourceInput,
  BrowseShelfInput,
  ShelfAssetInput,
  ShelfAssetResult,
  ShelfBrowseResult,
  ShelfSource,
  UpdateShelfSourceInput,
} from '@memorilo/shelf'

export type {
  AddShelfSourceInput,
  BrowseShelfInput,
  ShelfAssetInput,
  ShelfAssetResult,
  ShelfBrowseResult,
  ShelfSource,
  UpdateShelfSourceInput,
} from '@memorilo/shelf'

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
  id: string
  snapshot: Uint8Array
  title: string
  updatedAt: number
}

export interface SaveDesktopNoteUpdatesInput {
  noteId: string
  updates: readonly Uint8Array[]
}

export interface DesktopNoteWriteReceipt {
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

export interface DesktopApi {
  addShelfSource: (input: AddShelfSourceInput) => Promise<ShelfSource>
  getCachedShelfView: (input: BrowseShelfInput) => Promise<ShelfBrowseResult>
  getRuntimeInfo: () => Promise<RuntimeInfo>
  getShelfAsset: (input: ShelfAssetInput) => Promise<ShelfAssetResult>
  getTopicBlock: (input: { blockId: string, noteId: string, topicId: string }) => Promise<DesktopStoredTopicBlock | null>
  listShelfSources: () => Promise<readonly ShelfSource[]>
  openMostRecentNote: () => Promise<DesktopNote>
  refreshShelfView: (input: BrowseShelfInput) => Promise<ShelfBrowseResult>
  removeShelfSource: (sourceId: string) => Promise<void>
  updateShelfSource: (input: UpdateShelfSourceInput) => Promise<ShelfSource>
  saveNoteUpdates: (input: SaveDesktopNoteUpdatesInput) => Promise<DesktopNoteWriteReceipt>
  searchTopicBlocks: (input: {
    limit?: number
    mode?: DesktopTopicBlockSearchMode
    noteId?: string
    query: string
  }) => Promise<readonly DesktopTopicBlockSearchHit[]>
}
