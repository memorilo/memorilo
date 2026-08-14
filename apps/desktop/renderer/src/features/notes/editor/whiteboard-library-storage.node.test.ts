import type { DesktopApi } from '@memorilo/desktop-preload'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { whiteboardLibraryPersistenceAdapter } from './whiteboard-library-storage'

const library = {
  libraryItems: [{
    created: 123,
    elements: [{
      height: 60,
      id: 'rectangle-1',
      isDeleted: false,
      link: null,
      type: 'rectangle',
      width: 80,
      x: 10,
      y: 20,
    }],
    id: 'library-item-1',
    status: 'unpublished' as const,
  }],
}

const loadWhiteboardLibrary = vi.fn<DesktopApi['loadWhiteboardLibrary']>()
const saveWhiteboardLibrary = vi.fn<DesktopApi['saveWhiteboardLibrary']>()
const localStorage = {
  getItem: vi.fn(() => JSON.stringify({ libraryItems: [], schemaVersion: 1 })),
  setItem: vi.fn(),
}

beforeEach(() => {
  vi.stubGlobal('window', {
    desktop: { loadWhiteboardLibrary, saveWhiteboardLibrary } as Pick<
      DesktopApi,
      'loadWhiteboardLibrary' | 'saveWhiteboardLibrary'
    >,
    localStorage,
  })
  loadWhiteboardLibrary.mockResolvedValue(library)
  saveWhiteboardLibrary.mockResolvedValue()
})

afterEach(() => {
  vi.clearAllMocks()
  vi.unstubAllGlobals()
})

describe('whiteboard library persistence adapter', () => {
  it('loads and saves through the desktop user document transport only', async () => {
    await expect(whiteboardLibraryPersistenceAdapter.load({ source: 'load' })).resolves.toEqual(library)
    await expect(whiteboardLibraryPersistenceAdapter.save(library)).resolves.toBeUndefined()

    expect(loadWhiteboardLibrary).toHaveBeenCalledOnce()
    expect(saveWhiteboardLibrary).toHaveBeenCalledWith(library)
    expect(localStorage.getItem).not.toHaveBeenCalled()
    expect(localStorage.setItem).not.toHaveBeenCalled()
  })
})
