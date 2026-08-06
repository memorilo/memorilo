import type { DesktopApi, DesktopConfiguration, DesktopNoteExternalUpdate } from './contract'
import type { DesktopServices } from './desktop-api'
import { desktopConfigurationDefinition } from '@memorilo/desktop-config'
import { describe, expect, it, vi } from 'vitest'
import { createDesktopApi } from './desktop-api'

function serviceStub(): DesktopServices {
  return {
    app: { getRuntimeInfo: vi.fn() },
    configuration: { get: vi.fn(), set: vi.fn() },
    learning: {
      archiveOptimizer: vi.fn(),
      assignNoteOptimizer: vi.fn(),
      createOptimizer: vi.fn(),
      getDailyProgress: vi.fn(),
      getLearningState: vi.fn(),
      getMaintenanceEstimate: vi.fn(),
      getNoteOptimizer: vi.fn(),
      getOptimizer: vi.fn(),
      getOptimizerNoteCount: vi.fn(),
      getNextItem: vi.fn(),
      getNextNewItem: vi.fn(),
      getNextReviewItem: vi.fn(),
      listNotesWithCards: vi.fn(),
      listOptimizers: vi.fn(),
      listQueue: vi.fn(),
      listTargets: vi.fn(),
      maintainDatabase: vi.fn(),
      optimizeOptimizer: vi.fn(),
      prepareReview: vi.fn(),
      rateMultiLineCard: vi.fn(),
      rateTarget: vi.fn(),
      renameOptimizer: vi.fn(),
      resetOptimizerDefaults: vi.fn(),
      resetTarget: vi.fn(),
      restoreReviewItem: vi.fn(),
      undoLastReview: vi.fn(),
      updateOptimizer: vi.fn(),
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
    window: { showColumnVisibilityMenu: vi.fn() },
  }
}

describe('desktop preload API', () => {
  it('exposes MCP configuration and external Note update subscriptions unchanged', async () => {
    const services = serviceStub()
    const configuration: DesktopConfiguration = {
      flashcards: desktopConfigurationDefinition.defaults.flashcards,
      goals: desktopConfigurationDefinition.defaults.goals,
      language: 'system',
      mcp: { accessToken: '0123456789abcdef0123456789abcdef', enabled: true, port: 8765 },
      outdentBehavior: 'logical',
      reduceMotion: false,
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
