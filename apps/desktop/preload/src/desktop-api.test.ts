import type { DesktopApi, DesktopConfiguration, DesktopNoteExternalUpdate } from './contract'
import type { DesktopServices } from './desktop-api'
import { describe, expect, it, vi } from 'vitest'
import { createDesktopApi } from './desktop-api'

function serviceStub(): DesktopServices {
  return {
    app: { getRuntimeInfo: vi.fn() },
    assets: {
      check: vi.fn(),
      importNetworkImage: vi.fn(),
      reclaim: vi.fn(),
      saveImage: vi.fn(),
    },
    books: {
      closeReadingSession: vi.fn(),
      createContext: vi.fn(),
      isReadingAvailable: vi.fn(),
      listContexts: vi.fn(),
      rebindContext: vi.fn(),
      selectContext: vi.fn(),
    },
    configuration: { get: vi.fn(), set: vi.fn() },
    journals: {
      listJournalDates: vi.fn(),
      listPastJournals: vi.fn(),
      openJournal: vi.fn(),
      prunePastEmptyJournals: vi.fn(),
    },
    notes: {
      createNote: vi.fn(),
      getNote: vi.fn(),
      getTopicBlock: vi.fn(),
      listFavoriteNotes: vi.fn(),
      listNotes: vi.fn(),
      listRecentNotes: vi.fn(),
      openMostRecentNote: vi.fn(),
      recordNoteOpened: vi.fn(),
      renameNote: vi.fn(),
      saveNoteUpdates: vi.fn(),
      searchNotes: vi.fn(),
      searchTopicBlocks: vi.fn(),
      setNoteFavorite: vi.fn(),
    },
    shelf: {
      addSource: vi.fn(),
      deleteReading: vi.fn(),
      getAsset: vi.fn(),
      getCachedView: vi.fn(),
      getPublicationDetails: vi.fn(),
      listSources: vi.fn(),
      openReading: vi.fn(),
      prepareReading: vi.fn(),
      readReadingRange: vi.fn(),
      refreshView: vi.fn(),
      removeSource: vi.fn(),
      updateSource: vi.fn(),
    },
    window: { showColumnVisibilityMenu: vi.fn() },
  }
}

describe('desktop preload API', () => {
  it('exposes MCP configuration and external Note update subscriptions unchanged', async () => {
    const services = serviceStub()
    const configuration: DesktopConfiguration = {
      language: 'system',
      mcp: { accessToken: '0123456789abcdef0123456789abcdef', enabled: true, port: 8765 },
      networkImagePasteBehavior: 'download',
      outdentBehavior: 'logical',
      readerArrowKeyPageTurning: true,
      readerEpubPresentationMode: 'publisher',
      reduceMotion: false,
      tiffConversionFormat: 'webp',
      weekStart: 'sunday',
    }
    vi.mocked(services.configuration.get).mockResolvedValue(configuration)
    vi.mocked(services.configuration.set).mockResolvedValue(configuration)

    let noteListener: ((update: DesktopNoteExternalUpdate) => void) | undefined
    const stopNoteUpdates = vi.fn()
    const subscribeNoteUpdates = vi.fn((listener: Parameters<DesktopApi['subscribeNoteUpdates']>[0]) => {
      noteListener = listener
      return stopNoteUpdates
    })
    const subscribeConfiguration = vi.fn(() => vi.fn())
    const subscribeNoteSaveRequests = vi.fn(() => vi.fn())
    const api = createDesktopApi(services, subscribeConfiguration, subscribeNoteSaveRequests, subscribeNoteUpdates)

    await expect(api.getConfiguration()).resolves.toEqual(configuration)
    await expect(api.setConfiguration(configuration)).resolves.toEqual(configuration)
    expect(services.configuration.set).toHaveBeenCalledWith(configuration)

    const listener = vi.fn()
    const unsubscribe = api.subscribeNoteUpdates(listener)
    const update = { noteId: 'note-1', update: Uint8Array.from([1, 2, 3]), updatedAt: 42 }
    noteListener?.(update)
    expect(listener).toHaveBeenCalledWith(update)
    unsubscribe()
    expect(stopNoteUpdates).toHaveBeenCalledTimes(1)
  })
})
