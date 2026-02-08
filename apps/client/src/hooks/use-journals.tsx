import type { JournalCursor, JournalEntry } from '@memorilo/api'
import { effectCommands } from '@memorilo/api/command'
import { useInfiniteQuery } from '@tanstack/react-query'
import { useVirtualizer } from '@tanstack/react-virtual'
import dayjs from 'dayjs'
import localizedFormat from 'dayjs/plugin/localizedFormat'
import { Effect } from 'effect'
import { keyBy, range } from 'es-toolkit/compat'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSetting } from './use-setting'

dayjs.extend(localizedFormat)

// Local date key format used by the UI and the backend (SQLite date(..., 'localtime')).
export const DATE_FORMAT = 'YYYY-MM-DD'

interface JournalDayItem {
  dateKey: string
  docId: string | null
}

interface JournalDaysPage {
  items: JournalDayItem[]
  nextCursor: string
}

interface JournalEntriesPage {
  items: JournalDayItem[]
  nextCursor: JournalCursor | null
}

export function getJournalCreateInput(dateKey: string) {
  const title = dayjs(dateKey, DATE_FORMAT).format('LL')
  // Use midday local time to avoid edge cases around DST / timezone conversions.
  const createdAt = dayjs(dateKey, DATE_FORMAT)
    .hour(12)
    .minute(0)
    .second(0)
    .millisecond(0)
    .toISOString()

  return { createdAt, title }
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

  const oldestLoadedKey = baseItems[baseItems.length - 1]?.dateKey

  for (const [dateKey, docId] of Object.entries(createdDocMap)) {
    if (seen.has(dateKey)) {
      continue
    }
    if (oldestLoadedKey && dateKey < oldestLoadedKey) {
      continue
    }

    const insertAt = merged.findIndex(item => item.dateKey < dateKey)
    merged.splice(insertAt === -1 ? merged.length : insertAt, 0, { dateKey, docId })
    seen.add(dateKey)
  }

  return merged
}

// Auto-create mode:
// Load a fixed window of days (14) ending at `endDateKey` (inclusive).
// The backend only returns existing journals; missing journals are created lazily by the visible row.
async function fetchAutoCreatePage(endDateKey?: string): Promise<JournalDaysPage> {
  const endKey = endDateKey ?? dayjs().format(DATE_FORMAT)
  const startKey = dayjs(endKey, DATE_FORMAT)
    .subtract(14 - 1, 'day')
    .format(DATE_FORMAT)

  const entries = await Effect.runPromise(
    effectCommands.getJournalsByDateRange(startKey, endKey),
  )

  // `getJournalsByDateRange` returns newest-first; reverse so `keyBy` keeps the newest when duplicated.
  const entriesByDate = keyBy(entries.slice().reverse(), 'journalDate') as Record<
    string,
    JournalEntry | undefined
  >

  const dateKeys = range(0, 14).map(offset =>
    dayjs(endKey, DATE_FORMAT).subtract(offset, 'day').format(DATE_FORMAT),
  )

  return {
    items: dateKeys.map(dateKey => ({
      dateKey,
      docId: entriesByDate[dateKey]?.docId ?? null,
    })),
    nextCursor: dayjs(startKey, DATE_FORMAT).subtract(1, 'day').format(DATE_FORMAT),
  }
}

// Existing-only mode:
// Cursor-based pagination for journals (descending by created_at/doc_id) joined with docs metadata.
async function fetchExistingPage(cursor?: JournalCursor | null): Promise<JournalEntriesPage> {
  const page = await Effect.runPromise(
    effectCommands.getJournals(cursor ?? null, 30),
  )
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

  // Two query strategies:
  // - autoCreate=true: page by days (today -> past) and lazily create journals for visible missing days
  // - autoCreate=false: page by existing journals only (cursor pagination)
  const autoCreateQuery = useInfiniteQuery({
    queryKey: ['journalDays', 'auto'],
    enabled: autoCreateEnabled,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => fetchAutoCreatePage(pageParam as string | undefined),
    getNextPageParam: lastPage => lastPage.nextCursor,
  })

  const existingQuery = useInfiniteQuery({
    queryKey: ['journalDays', 'existing'],
    enabled: !autoCreateEnabled,
    initialPageParam: null as JournalCursor | null,
    queryFn: ({ pageParam }) => fetchExistingPage(pageParam as JournalCursor | null),
    getNextPageParam: lastPage => lastPage.nextCursor ?? undefined,
  })

  const activeQuery = autoCreateEnabled ? autoCreateQuery : existingQuery

  // Flatten pages into a single list for virtualization.
  const baseItems = useMemo(
    () => (activeQuery.data ? activeQuery.data.pages.flatMap(page => page.items) : []),
    [activeQuery.data],
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

  // `items` is the virtual list data source.
  // - autoCreate=true: the list is continuous days (today -> past)
  // - autoCreate=false: the list is existing journals, plus a "today" placeholder row to create if missing
  const items = useMemo(
    () => (autoCreateEnabled ? baseItems : mergeExistingItems(baseItems, createdDocMap, todayKey)),
    [autoCreateEnabled, baseItems, createdDocMap, todayKey],
  )

  // Virtualized list:
  // - overscan=0 to avoid pre-rendering (and thus pre-creating) future days
  // - load next page only when the last visible row reaches the end of the loaded items
  const parentRef = useRef<HTMLDivElement | null>(null)
  const rowVirtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    // Use a stable key so virtualizer size cache doesn't get confused when `items` changes
    // (e.g. inserting "today" placeholder or a newly-created journal day).
    getItemKey: index => items[index]?.dateKey ?? index,
    estimateSize: () => 260,
    overscan: 0,
  })

  const virtualItems = rowVirtualizer.getVirtualItems()

  useEffect(() => {
    const lastItem = virtualItems[virtualItems.length - 1]
    if (!lastItem) {
      return
    }
    if (lastItem.index < items.length - 1) {
      return
    }

    if (activeQuery.hasNextPage && !activeQuery.isFetchingNextPage) {
      activeQuery.fetchNextPage()
    }
  }, [
    activeQuery,
    items.length,
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
      const { createdAt, title } = getJournalCreateInput(dateKey)

      const docId = await Effect.runPromise(
        effectCommands.createJournal(createdAt, title).pipe(
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

        let pagesLen = autoCreateQuery.data?.pages.length ?? 0
        if (pagesLen === 0) {
          const res = await autoCreateQuery.refetch()
          pagesLen = res.data?.pages.length ?? pagesLen
        }

        const requiredPages = Math.ceil((targetIndex + 1) / 14)
        while (pagesLen < requiredPages) {
          const res = await autoCreateQuery.fetchNextPage()
          pagesLen = res.data?.pages.length ?? pagesLen
        }

        await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
        rowVirtualizer.scrollToIndex(targetIndex, { align: 'start', behavior: 'smooth' })
        return
      }

      let flat = baseItems
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
      rowVirtualizer.scrollToIndex(targetIndex, { align: 'start', behavior: 'smooth' })
    }
    finally {
      setJumping(false)
    }
  }, [
    autoCreateEnabled,
    autoCreateQuery,
    baseItems,
    createdDocMap,
    existingQuery,
    handleCreated,
    rowVirtualizer,
    todayKey,
  ])

  return {
    autoCreateEnabled,
    todayKey,
    items,
    createdDocMap,
    handleCreated,
    parentRef,
    rowVirtualizer,
    virtualItems,
    activeQuery,
    jumping,
    jumpToDate,
  }
}

export type JournalsState = ReturnType<typeof useJournals>
