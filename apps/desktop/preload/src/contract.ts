export interface RuntimeInfo {
  platform: string
  version: string
}

export interface DesktopDocumentNode {
  attributes: Readonly<Record<string, unknown>>
  id: string
  kind: string
  ordinal: number
  parentId: string | null
  text: string
}

export interface DesktopDocument {
  id: string
  snapshot: Uint8Array | null
  title: string
  updatedAt: number
}

export interface SaveDesktopDocumentInput {
  id: string
  nodes: readonly DesktopDocumentNode[]
  snapshot: Uint8Array
  title: string
}

export interface DesktopStoredNode extends DesktopDocumentNode {
  contentHash: string
  documentId: string
}

export interface DesktopNodeSearchHit extends DesktopStoredNode {
  preview: string
  rank: number
}

export type DesktopNodeSearchMode = 'hybrid' | 'lexical' | 'semantic'

export interface DesktopApi {
  getNode: (input: { documentId: string, nodeId: string }) => Promise<DesktopStoredNode | null>
  getRuntimeInfo: () => Promise<RuntimeInfo>
  openMostRecentDocument: () => Promise<DesktopDocument>
  saveDocument: (input: SaveDesktopDocumentInput) => Promise<DesktopDocument>
  searchNodes: (input: { query: string, documentId?: string, limit?: number, mode?: DesktopNodeSearchMode }) => Promise<readonly DesktopNodeSearchHit[]>
}
