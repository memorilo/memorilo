import type { JournalCursor } from '@memorilo/api-spec/services/journal'
import { runPromise } from '@memorilo/api-spec'
import { JournalService } from '@memorilo/api-spec/services/journal'
import { useInfiniteQuery, useQueries } from '@tanstack/react-query'
import { useVirtualizer } from '@tanstack/react-virtual'
import dayjs from 'dayjs'
import localizedFormat from 'dayjs/plugin/localizedFormat'
import { Effect } from 'effect'
import { range } from 'es-toolkit/compat'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSetting } from './use-setting'

dayjs.extend(localizedFormat)

// Local date key format used by the UI and the backend (SQLite date(..., 'localtime')).
export const DATE_FORMAT = 'YYYY-MM-DD'

interface JournalDayItem {
  dateKey: string
  docId: string | null
}

interface JournalEntriesPage {
  items: JournalDayItem[]
  nextCursor: JournalCursor | null
}

export function getJournalCreateInput(dateKey: string) {
  const title = dayjs(dateKey, DATE_FORMAT).format('LL')
  // Use midday local time to avoid edge cases around DST / timezone conversions.
  const journalAt = dayjs(dateKey, DATE_FORMAT)
    .hour(12)
    .minute(0)
    .second(0)
    .millisecond(0)
    .toISOString()

  return { journalAt, title }
}

// Merge query results (existing journals) with journals created during this session.
// This is used only in `autoCreate=false` mode, because cursor pagination doesn't guarantee
// the newly created journal will be included in the currently loaded pages.
function mergeExistingItems(
  baseItems: JournalDayItem[],
  createdDocMap: Record<string, string>,
  todayKey: string,
): JournalDayItem[] {
  const merged: JournalDayItem[] = [...baseItems]
  const seen = new Set(merged.map(item => item.dateKey))

  // When auto-create is disabled, we still ensure "today" exists (only today, not the past).
  // We do this by prepending a placeholder row for today when it's missing, so creation is
  // triggered only when the row is actually rendered.
  if (!seen.has(todayKey)) {
    merged.unshift({ dateKey: todayKey, docId: null })
    seen.add(todayKey)
  }

  for (const [dateKey, docId] of Object.entries(createdDocMap)) {
    if (seen.has(dateKey)) {
      continue
    }

    const insertAt = merged.findIndex(item => item.dateKey < dateKey)
    merged.splice(insertAt === -1 ? merged.length : insertAt, 0, { dateKey, docId })
    seen.add(dateKey)
  }

  return merged
}

// Existing-only mode:
// Cursor-based pagination for journals (descending by journalAt/docId) joined with docs metadata.
async function fetchExistingPage(cursor?: JournalCursor | null): Promise<JournalEntriesPage> {
  const page = await runPromise(Effect.gen(function* () {
    const journalService = yield* JournalService
    return yield* journalService.getJournals(cursor ?? null, 30)
  }))
  return {
    items: page.items.map(entry => ({
      dateKey: entry.journalDate,
      docId: entry.docId,
    })),
    nextCursor: page.nextCursor ?? null,
  }
}

/**
 * Journals list state for the `/journals` route.
 *
 * Supports two strategies:
 * - `journal::autoCreate = true`: render a continuous timeline (today -> past) and lazily create
 *   missing journals only when their row becomes visible.
 * - `journal::autoCreate = false`: render existing journals only, but still ensure "today" exists
 *   (created lazily when the today row becomes visible).
 */
export function useJournals() {
  const { data: autoCreateEnabled } = useSetting('journal::autoCreate', false)
  const todayKey = dayjs().format(DATE_FORMAT)

  const existingQuery = useInfiniteQuery({
    queryKey: ['journalDays', 'existing'],
    enabled: !autoCreateEnabled,
    initialPageParam: null as JournalCursor | null,
    queryFn: ({ pageParam }) => fetchExistingPage(pageParam as JournalCursor | null),
    getNextPageParam: lastPage => lastPage.nextCursor ?? undefined,
  })

  // Flatten existing-journal pages into a single list for virtualization.
  const baseExistingItems = useMemo(
    () => (existingQuery.data ? existingQuery.data.pages.flatMap(page => page.items) : []),
    [existingQuery.data],
  )

  // Journals created during this session (e.g. auto-create rows or calendar jump),
  // keyed by local date (YYYY-MM-DD). This lets the UI render immediately without waiting
  // for queries to refetch/merge the new journal into their pages.
  const [createdDocMap, setCreatedDocMap] = useState<Record<string, string>>({})

  const handleCreated = useCallback((dateKey: string, docId: string) => {
    setCreatedDocMap((prev) => {
      if (prev[dateKey]) {
        return prev
      }
      return { ...prev, [dateKey]: docId }
    })
  }, [])

  const [autoDaysCount, setAutoDaysCount] = useState(14)

  // Existing-only list data source (cursor pagination).
  const existingItems = useMemo(() => {
    if (autoCreateEnabled) {
      return []
    }
    return mergeExistingItems(baseExistingItems, createdDocMap, todayKey)
  }, [autoCreateEnabled, baseExistingItems, createdDocMap, todayKey])

  // Virtualized list:
  // - overscan=0 to avoid pre-rendering (and thus pre-creating) future days
  // - load next page only when the last visible row reaches the end of the loaded items
  const parentRef = useRef<HTMLDivElement | null>(null)
  const rowVirtualizer = useVirtualizer({
    count: autoCreateEnabled ? autoDaysCount : existingItems.length,
    getScrollElement: () => parentRef.current,
    // Use a stable key so the virtualizer size cache doesn't get confused when rows are inserted
    // (e.g. the "today" placeholder or a newly-created journal day in existing-only mode).
    getItemKey: (index: number) => {
      if (autoCreateEnabled) {
        return dayjs(todayKey, DATE_FORMAT).subtract(index, 'day').format(DATE_FORMAT)
      }
      return existingItems[index]?.dateKey ?? index
    },
    estimateSize: () => 260,
    overscan: 0,
  })

  const virtualItems = rowVirtualizer.getVirtualItems()

  const getRow = useCallback((index: number): JournalDayItem | null => {
    if (autoCreateEnabled) {
      const dateKey = dayjs(todayKey, DATE_FORMAT).subtract(index, 'day').format(DATE_FORMAT)
      return { dateKey, docId: null }
    }
    return existingItems[index] ?? null
  }, [autoCreateEnabled, existingItems, todayKey])

  // In auto-create mode, we query only the *currently visible* time window so:
  // - the initial render stays fast
  // - jumping to a far date doesn't fetch intermediate days
  // We group requests into 14-day blocks to avoid refetching on every small scroll.
  const visibleDateRange = useMemo(() => {
    const first = virtualItems[0]?.index
    const last = virtualItems[virtualItems.length - 1]?.index
    if (first == null || last == null) {
      return null
    }

    const startBlock = Math.floor(first / 14)
    const endBlock = Math.floor(last / 14)

    return range(startBlock, endBlock + 1).map((block) => {
      const startIndex = block * 14
      const endIndex = startIndex + (14 - 1)

      const endKey = dayjs(todayKey, DATE_FORMAT)
        .subtract(startIndex, 'day')
        .format(DATE_FORMAT)
      const startKey = dayjs(todayKey, DATE_FORMAT)
        .subtract(endIndex, 'day')
        .format(DATE_FORMAT)

      return { startKey, endKey }
    })
  }, [todayKey, virtualItems])

  const autoRangeQueries = useQueries({
    queries: autoCreateEnabled && visibleDateRange
      ? visibleDateRange.map(({ startKey, endKey }) => ({
          queryKey: ['journalsByDateRange', startKey, endKey],
          queryFn: () => runPromise(Effect.gen(function* () {
            const journalService = yield* JournalService
            return yield* journalService.getJournalsByDateRange(startKey, endKey)
          })),
        }))
      : [],
  })

  const autoDocIdByDateKey = useMemo(() => {
    if (!autoCreateEnabled) {
      return {}
    }

    // `getJournalsByDateRange` returns newest-first; reverse so the newest wins when duplicated.
    const map: Record<string, string> = {}
    for (const q of autoRangeQueries) {
      if (q.status !== 'success') {
        continue
      }
      for (const entry of q.data.slice().reverse()) {
        map[entry.journalDate] = entry.docId
      }
    }
    return map
  }, [autoCreateEnabled, autoRangeQueries])

  const docIdByDateKey = useMemo(() => {
    const map: Record<string, string> = {}
    for (const item of existingItems) {
      if (item.docId) {
        map[item.dateKey] = item.docId
      }
    }
    Object.assign(map, autoDocIdByDateKey)
    Object.assign(map, createdDocMap)
    return map
  }, [autoDocIdByDateKey, createdDocMap, existingItems])

  const listError = useMemo(() => {
    if (!autoCreateEnabled) {
      return existingQuery.status === 'error' ? existingQuery.error : null
    }
    const errQuery = autoRangeQueries.find(q => q.status === 'error')
    return errQuery ? errQuery.error : null
  }, [autoCreateEnabled, autoRangeQueries, existingQuery.error, existingQuery.status])

  const listStatus = useMemo(() => {
    if (!autoCreateEnabled) {
      return existingQuery.status
    }
    return listError ? 'error' : 'success'
  }, [autoCreateEnabled, existingQuery.status, listError])

  useEffect(() => {
    if (autoCreateEnabled) {
      return
    }

    const lastItem = virtualItems[virtualItems.length - 1]
    if (!lastItem) {
      return
    }
    if (lastItem.index < existingItems.length - 1) {
      return
    }

    if (existingQuery.hasNextPage && !existingQuery.isFetchingNextPage) {
      existingQuery.fetchNextPage()
    }
  }, [
    autoCreateEnabled,
    existingItems.length,
    existingQuery,
    virtualItems,
  ])

  const [jumping, setJumping] = useState(false)

  // Jump to a specific day:
  // - ensure the journal exists (idempotent create on the backend)
  // - ensure the virtual list has loaded enough rows to reach it
  // - scroll to the target row
  const jumpToDate = useCallback(async (value: Date) => {
    setJumping(true)
    try {
      const dateKey = dayjs(value).format(DATE_FORMAT)
      const { journalAt, title } = getJournalCreateInput(dateKey)

      const docId = await runPromise(
        Effect.gen(function* () {
          const journalService = yield* JournalService
          return yield* journalService.createJournal(journalAt, title)
        }).pipe(
          Effect.catchAll(() => Effect.succeed(null)),
        ),
      )

      const nextCreatedDocMap = docId ? { ...createdDocMap, [dateKey]: docId } : createdDocMap
      if (docId) {
        handleCreated(dateKey, docId)
      }

      if (autoCreateEnabled) {
        const targetIndex = Math.max(
          0,
          dayjs(todayKey, DATE_FORMAT).diff(dayjs(dateKey, DATE_FORMAT), 'day'),
        )
        if (targetIndex >= autoDaysCount) {
          setAutoDaysCount(targetIndex + 1)
        }

        await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
        // NOTE: don't use smooth scrolling for large jumps; it mounts intermediate rows and can trigger
        // auto-create for days we scroll past.
        rowVirtualizer.scrollToIndex(targetIndex, { align: 'start' })
        return
      }

      let flat = baseExistingItems
      if (flat.length === 0) {
        const res = await existingQuery.refetch()
        flat = res.data ? res.data.pages.flatMap(page => page.items) : flat
      }

      // If the target is older than what's loaded, load more pages until the target day is in-range.
      let oldestLoadedKey = flat[flat.length - 1]?.dateKey
      let hasNext = existingQuery.hasNextPage
      while (oldestLoadedKey && dateKey < oldestLoadedKey && hasNext) {
        const res = await existingQuery.fetchNextPage()
        if (res.data) {
          flat = res.data.pages.flatMap(page => page.items)
        }
        oldestLoadedKey = flat[flat.length - 1]?.dateKey
        hasNext = res.hasNextPage
      }

      const merged = mergeExistingItems(flat, nextCreatedDocMap, todayKey)
      const index = merged.findIndex(item => item.dateKey === dateKey)
      const targetIndex = index >= 0
        ? index
        : (() => {
            const insertAt = merged.findIndex(item => item.dateKey < dateKey)
            return insertAt === -1 ? merged.length : insertAt
          })()

      await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
      rowVirtualizer.scrollToIndex(targetIndex, { align: 'start' })
    }
    finally {
      setJumping(false)
    }
  }, [
    autoDaysCount,
    autoCreateEnabled,
    baseExistingItems,
    createdDocMap,
    existingQuery,
    handleCreated,
    rowVirtualizer,
    todayKey,
  ])

  return {
    autoCreateEnabled,
    todayKey,
    getRow,
    docIdByDateKey,
    handleCreated,
    parentRef,
    rowVirtualizer,
    virtualItems,
    listStatus,
    listError,
    jumping,
    jumpToDate,
    onAutoScrollEnd: autoCreateEnabled
      ? () => setAutoDaysCount(prev => prev + 14)
      : null,
  }
}

export type JournalsState = ReturnType<typeof useJournals>
