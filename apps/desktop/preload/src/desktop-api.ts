import type {
  DesktopApi,
  DesktopDocument,
  DesktopNodeSearchHit,
  DesktopNodeSearchMode,
  DesktopStoredNode,
  RuntimeInfo,
  SaveDesktopDocumentInput,
} from './contract'

export interface DesktopServices {
  app: {
    getRuntimeInfo: () => Promise<RuntimeInfo>
  }
  documents: {
    getNode: (input: { documentId: string, nodeId: string }) => Promise<DesktopStoredNode | null>
    openMostRecentDocument: () => Promise<DesktopDocument>
    saveDocument: (input: SaveDesktopDocumentInput) => Promise<DesktopDocument>
    searchNodes: (input: { query: string, documentId?: string, limit?: number, mode?: DesktopNodeSearchMode }) => Promise<readonly DesktopNodeSearchHit[]>
  }
}

export function createDesktopApi(services: DesktopServices): DesktopApi {
  return {
    getNode: input => services.documents.getNode(input),
    getRuntimeInfo: () => services.app.getRuntimeInfo(),
    openMostRecentDocument: () => services.documents.openMostRecentDocument(),
    saveDocument: input => services.documents.saveDocument(input),
    searchNodes: input => services.documents.searchNodes(input),
  }
}
