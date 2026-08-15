import type { DesktopApi, DesktopConfiguration, DesktopNoteExternalUpdate } from './contract'
import type { DesktopIpcClient } from './ipc-contract'
import { desktopConfigurationDefinition } from '@memorilo/desktop-config'
import { describe, expect, it, vi } from 'vitest'
import { createDesktopApi } from './desktop-api'

function serviceStub(): DesktopIpcClient {
  return {
    app: { getRuntimeInfo: vi.fn() },
    backup: { exportDatabase: vi.fn(), restoreDatabase: vi.fn() },
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
    configuration: { get: vi.fn(), set: vi.fn(), setValue: vi.fn() },
    journals: {
      listJournalDates: vi.fn(),
      listPastJournals: vi.fn(),
      openJournal: vi.fn(),
      prunePastEmptyJournals: vi.fn(),
    },
    learning: {
      answerAnkiReviewCard: vi.fn(),
      archiveOptimizer: vi.fn(),
      assignNoteOptimizer: vi.fn(),
      createOptimizer: vi.fn(),
      endAnkiReview: vi.fn(),
      getCurrentAnkiReviewCard: vi.fn(),
      getActivitySummary: vi.fn(),
      getDailyProgress: vi.fn(),
      getLearningState: vi.fn(),
      getMaintenanceEstimate: vi.fn(),
      getNoteOptimizer: vi.fn(),
      getOptimizer: vi.fn(),
      getOptimizerNoteCount: vi.fn(),
      getNextItem: vi.fn(),
      getNextNewItem: vi.fn(),
      getNextReviewItem: vi.fn(),
      listAnkiDecks: vi.fn(),
      listNotesWithCards: vi.fn(),
      listOptimizers: vi.fn(),
      listQueue: vi.fn(),
      listTargets: vi.fn(),
      maintainDatabase: vi.fn(),
      optimizeOptimizer: vi.fn(),
      prepareReview: vi.fn(),
      playAnkiReviewAudio: vi.fn(),
      rateMultiLineCard: vi.fn(),
      rateTarget: vi.fn(),
      resetOptimizerDefaults: vi.fn(),
      resetTarget: vi.fn(),
      retrieveAnkiMediaFile: vi.fn(),
      restoreReviewItem: vi.fn(),
      undoLastReview: vi.fn(),
      undoReviews: vi.fn(),
      saveOptimizer: vi.fn(),
      showAnkiReviewAnswer: vi.fn(),
      startAnkiDeckReview: vi.fn(),
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
    whiteboardLibrary: {
      load: vi.fn(),
      save: vi.fn(),
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
    window: { captureReaderRegion: vi.fn(), showColumnVisibilityMenu: vi.fn() },
  }
}

describe('desktop preload API', () => {
  it('exposes the user Whiteboard Library transport unchanged', async () => {
    const services = serviceStub()
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
    vi.mocked(services.whiteboardLibrary.load).mockResolvedValue(library)
    vi.mocked(services.whiteboardLibrary.save).mockResolvedValue()
    const api = createDesktopApi(
      services,
      vi.fn(() => vi.fn()),
      vi.fn(() => vi.fn()),
      vi.fn(() => vi.fn()),
    )

    await expect(api.loadWhiteboardLibrary()).resolves.toEqual(library)
    await expect(api.saveWhiteboardLibrary(library)).resolves.toBeUndefined()
    expect(services.whiteboardLibrary.save).toHaveBeenCalledWith(library)
  })

  it('exposes MCP configuration and external Note update subscriptions unchanged', async () => {
    const services = serviceStub()
    const configuration: DesktopConfiguration = {
      anki: desktopConfigurationDefinition.defaults.anki,
      backup: desktopConfigurationDefinition.defaults.backup,
      flashcards: desktopConfigurationDefinition.defaults.flashcards,
      goals: desktopConfigurationDefinition.defaults.goals,
      language: 'system',
      mcp: { accessToken: '0123456789abcdef0123456789abcdef', enabled: true, port: 8765 },
      networkImagePasteBehavior: 'download',
      outdentBehavior: 'logical',
      readerArrowKeyPageTurning: true,
      readerAnnotationCopyFormat: 'text',
      readerEpubPresentationMode: 'publisher',
      readerPageMode: 'continuous',
      reduceMotion: false,
      tiffConversionFormat: 'webp',
      weekStart: 'sunday',
    }
    vi.mocked(services.configuration.get).mockResolvedValue(configuration)
    vi.mocked(services.configuration.set).mockResolvedValue(configuration)
    vi.mocked(services.configuration.setValue).mockResolvedValue(configuration)

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
    await expect(api.setConfigurationValue('reduceMotion', true)).resolves.toEqual(configuration)
    expect(services.configuration.setValue).toHaveBeenCalledWith('reduceMotion', true)

    const png = Uint8Array.from([137, 80, 78, 71])
    vi.mocked(services.window.captureReaderRegion).mockResolvedValue(png)
    await expect(api.captureReaderRegion({ height: 20, width: 30, x: 10, y: 5 })).resolves.toEqual(png)
    expect(services.window.captureReaderRegion).toHaveBeenCalledWith({ height: 20, width: 30, x: 10, y: 5 })

    const listener = vi.fn()
    const unsubscribe = api.subscribeNoteUpdates(listener)
    const update = { noteId: 'note-1', update: Uint8Array.from([1, 2, 3]), updatedAt: 42 }
    noteListener?.(update)
    expect(listener).toHaveBeenCalledWith(update)
    unsubscribe()
    expect(stopNoteUpdates).toHaveBeenCalledTimes(1)
  })
})
