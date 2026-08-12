import {
  createLatestOperationSupervisor,
  createResourceScope,
} from '@memorilo/effect-lifecycle'

export type JournalOperationResult = 'committed' | 'superseded'

interface JournalOperation<Loaded> {
  commit: (loaded: Loaded) => void
  fail?: (error: unknown) => void
  load: (signal: AbortSignal) => Promise<Loaded>
  prepare?: (loaded: Loaded, signal: AbortSignal) => Promise<void>
}

export interface JournalRouteCoordinator {
  close: () => Promise<void>
  refreshToday: <Loaded>(
    operation: JournalOperation<Loaded>,
  ) => Promise<JournalOperationResult>
  select: <Loaded>(
    operation: JournalOperation<Loaded>,
  ) => Promise<JournalOperationResult>
}

export function createJournalRouteCoordinator({
  flush,
}: {
  flush: () => Promise<void>
}): JournalRouteCoordinator {
  type Channel = 'refreshToday' | 'select'
  const operations = createLatestOperationSupervisor<Channel>('Journal route coordinator')

  const runLatest = <Loaded>(
    channel: Channel,
    operation: JournalOperation<Loaded>,
  ): Promise<JournalOperationResult> => operations.run(channel, async ({ isCurrent, signal }) => {
    try {
      if (!isCurrent())
        return
      await flush()
      if (!isCurrent())
        return
      const loaded = await operation.load(signal)
      if (!isCurrent())
        return
      if (operation.prepare)
        await operation.prepare(loaded, signal)
      if (!isCurrent())
        return
      operation.commit(loaded)
    }
    catch (error) {
      if (isCurrent())
        operation.fail?.(error)
      throw error
    }
  }).then(result => result.status === 'current' ? 'committed' : 'superseded')

  const owner = createResourceScope('Journal route coordinator')
  owner.own({
    name: 'Journal route operations',
    close: () => operations.close(),
  })
  // ResourceScope finalizers are closed in reverse registration order. The
  // final flush therefore runs after every accepted route operation drains.
  owner.own({
    name: 'Journal final flush',
    close: flush,
  })
  owner.commit()

  return {
    close: owner.close,
    refreshToday: operation => runLatest('refreshToday', operation),
    select: operation => runLatest('select', operation),
  }
}
