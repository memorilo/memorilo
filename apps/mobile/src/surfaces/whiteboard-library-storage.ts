import type { WhiteboardLibraryPersistenceAdapter } from '@memorilo/editor'

const storageKey = 'memorilo:whiteboard-library:v1'

export const mobileWhiteboardLibraryPersistenceAdapter: WhiteboardLibraryPersistenceAdapter = {
  load: () => {
    const stored = localStorage.getItem(storageKey)
    if (stored === null)
      return null
    const parsed: unknown = JSON.parse(stored)
    if (parsed === null || typeof parsed !== 'object' || !('libraryItems' in parsed))
      throw new Error('Stored Whiteboard library is invalid')
    return parsed as Awaited<ReturnType<WhiteboardLibraryPersistenceAdapter['load']>>
  },
  save: data => localStorage.setItem(storageKey, JSON.stringify(data)),
}
