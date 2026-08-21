import type { DesktopApi } from '@memorilo/desktop-preload'
import { desktopConfigurationDefinition } from '@memorilo/desktop-config'
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query'
import { act, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { DesktopConfigurationContext } from '../../../shared/configuration'
import { NotePersistenceManager } from './note-persistence-manager'
import { NotePersistenceProvider } from './note-persistence-provider'

describe('note persistence remote updates', () => {
  afterEach(() => {
    Reflect.deleteProperty(window, 'desktop')
  })

  it('refreshes active learning queries when a remote learning update arrives', async () => {
    let notifyLearningUpdate: (() => void) | undefined
    Object.defineProperty(window, 'desktop', {
      configurable: true,
      value: {
        subscribeLearningUpdates(listener: () => void) {
          notifyLearningUpdate = listener
          return () => undefined
        },
        subscribeNoteSaveRequests: () => () => undefined,
        subscribeNoteUpdates: () => () => undefined,
      } as unknown as DesktopApi,
    })
    const manager = new NotePersistenceManager({
      adapter: { saveNoteUpdates: async () => ({ acceptedUpdateHashes: [], latestSequence: 0, updatedAt: 0 }) },
    })
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    let revision = 0
    function LearningState() {
      const query = useQuery({
        queryFn: async () => `revision-${++revision}`,
        queryKey: ['learning', 'queue'],
      })
      return <output>{query.data ?? 'loading'}</output>
    }
    const rendered = render(
      <DesktopConfigurationContext value={desktopConfigurationDefinition.defaults}>
        <QueryClientProvider client={queryClient}>
          <NotePersistenceProvider manager={manager}>
            <LearningState />
          </NotePersistenceProvider>
        </QueryClientProvider>
      </DesktopConfigurationContext>,
    )
    await rendered.findByText('revision-1')

    act(() => notifyLearningUpdate?.())

    await rendered.findByText('revision-2')
    rendered.unmount()
    await manager.close()
    queryClient.clear()
    expect(revision).toBe(2)
  })
})
