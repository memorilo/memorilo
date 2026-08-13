import type { EditorUserDocumentStorage } from '@memorilo/editor-storage'
import type { WhiteboardLibraryDocument, WhiteboardLibraryItem } from '@memorilo/editor/note'
import { createWhiteboardLibraryDocument } from '@memorilo/editor/note'
import { createOperationSupervisor } from '@memorilo/effect-lifecycle'

const whiteboardLibraryDocumentId = 'whiteboard-library'

export interface WhiteboardLibraryData {
  libraryItems: readonly WhiteboardLibraryItem[]
}

export class WhiteboardLibraryApplication {
  readonly #operations = createOperationSupervisor('Whiteboard Library')
  #document: WhiteboardLibraryDocument

  private constructor(
    private readonly storage: EditorUserDocumentStorage,
    document: WhiteboardLibraryDocument,
  ) {
    this.#document = document
  }

  static async open(storage: EditorUserDocumentStorage): Promise<WhiteboardLibraryApplication> {
    const snapshot = await storage.load(whiteboardLibraryDocumentId)
    const document = snapshot === null
      ? createWhiteboardLibraryDocument()
      : createWhiteboardLibraryDocument({ snapshot })
    if (snapshot === null) {
      await storage.save({
        documentId: whiteboardLibraryDocumentId,
        snapshot: document.exportSnapshot(),
      })
    }
    return new WhiteboardLibraryApplication(storage, document)
  }

  close(): Promise<void> {
    return this.#operations.close()
  }

  load(): Promise<WhiteboardLibraryData> {
    return this.#operations.run(async () => ({
      libraryItems: this.#document.getItems(),
    }))
  }

  save(data: WhiteboardLibraryData): Promise<void> {
    return this.#operations.run(async () => {
      const candidate = createWhiteboardLibraryDocument({
        snapshot: this.#document.exportSnapshot(),
      })
      candidate.replaceItems(data.libraryItems)
      await this.storage.save({
        documentId: whiteboardLibraryDocumentId,
        snapshot: candidate.exportSnapshot(),
      })
      this.#document = candidate
    })
  }
}
