import type { EditorStorage } from '@memorilo/editor-storage'
import { IpcMethod, IpcService } from 'electron-ipc-decorator'

async function indexDocument(storage: EditorStorage, documentId: string): Promise<void> {
  let indexed: number
  do {
    indexed = await storage.indexPendingEmbeddings({ documentId, limit: 256 })
  } while (indexed === 256)
}

export function createDocumentService(storage: EditorStorage) {
  let indexing = Promise.resolve()
  const scheduleIndex = (documentId: string) => {
    indexing = indexing
      .then(() => indexDocument(storage, documentId))
      .catch(error => console.error(`Failed to index document ${documentId}`, error))
  }

  class DocumentService extends IpcService {
    static override readonly groupName = 'documents'

    @IpcMethod()
    async openMostRecentDocument() {
      return storage.openMostRecentDocument()
    }

    @IpcMethod()
    async saveDocument(input: Parameters<EditorStorage['saveDocument']>[0]) {
      const document = await storage.saveDocument(input)
      scheduleIndex(input.id)
      return document
    }

    @IpcMethod()
    getNode(input: Parameters<EditorStorage['getNode']>[0]) {
      return storage.getNode(input)
    }

    @IpcMethod()
    searchNodes(input: Parameters<EditorStorage['searchNodes']>[0]) {
      return storage.searchNodes(input)
    }
  }

  return DocumentService
}
