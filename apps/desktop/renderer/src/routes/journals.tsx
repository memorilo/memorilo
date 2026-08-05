import type {
  DesktopJournalNote,
  DesktopJournalPage,
  DesktopJournalSummary,
  JournalDate,
} from '@memorilo/desktop-preload'
import type { EditorNote, EditorTopicDocument } from '@memorilo/editor'
import type { EditorNoteSessionCache } from '../editor-note-session-cache'
import { JournalEditor, resolveJournalTopic } from '@memorilo/editor'
import * as stylex from '@stylexjs/stylex'
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { useVirtualizer } from '@tanstack/react-virtual'
import { LoaderCircle, TriangleAlert } from 'lucide-react'
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'react-toastify/unstyled'

import { usePageTitlebar } from '../components/page-titlebar'
import { useDesktopConfiguration } from '../configuration-context'
import { createEditorNoteSessionCache } from '../editor-note-session-cache'
import { useFlushNotePersistence } from '../note-persistence-hooks'
import { journalQueryKeys } from '../queries/journal-query-keys'
import { noteQueryKeys } from '../queries/note-query-keys'
import { JournalCalendarControl } from './-journal-calendar-control'
import {
  formatJournalHeading,
  fromJournalDate,
  journalMonthBounds,
  startOfJournalMonth,
} from './-journal-date'
import { journalRouteStyles } from './-journals.stylex'
import {
  desktopEditorAdapters,
  useEditorNoteSession,
} from './-note-editor-session'

interface JournalSearch {
  date?: JournalDate
}

interface JournalFeedItem {
  summary: DesktopJournalSummary
}

const journalPageSize = 20
const journalSessionCacheCapacity = 8

interface JournalScrollAnchor {
  noteId: string
  viewportOffset: number
}

function findJournalRow(scrollElement: HTMLElement, noteId: string): HTMLElement | null {
  for (const row of scrollElement.querySelectorAll<HTMLElement>('[data-journal-note-id]')) {
    if (row.dataset.journalNoteId === noteId)
      return row
  }
  return null
}

function captureJournalScrollAnchor(scrollElement: HTMLElement): JournalScrollAnchor | null {
  if (scrollElement.scrollTop <= 1)
    return null
  const viewportTop = scrollElement.getBoundingClientRect().top
  for (const row of scrollElement.querySelectorAll<HTMLElement>('[data-journal-note-id]')) {
    const bounds = row.getBoundingClientRect()
    if (bounds.bottom > viewportTop) {
      const noteId = row.dataset.journalNoteId
      if (!noteId)
        throw new Error('Rendered Journal row is missing its Note identity')
      return { noteId, viewportOffset: bounds.top - viewportTop }
    }
  }
  return null
}

function validateJournalSearch(search: Record<string, unknown>): JournalSearch {
  if (search.date === undefined)
    return {}
  if (typeof search.date !== 'string')
    throw new TypeError('Journal date search parameter must be a string')
  fromJournalDate(search.date)
  return { date: search.date }
}

export const Route = createFileRoute('/journals')({
  component: JournalsRoute,
  validateSearch: validateJournalSearch,
})

function journalSummary(note: DesktopJournalNote): DesktopJournalSummary {
  return {
    createdAt: note.createdAt,
    journalDate: note.journalDate,
    kind: 'journal',
    noteId: note.id,
    title: note.journalDate,
    topicId: note.topicId,
    updatedAt: note.updatedAt,
  }
}

function estimateJournalSize() {
  return 430
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function resolveStoredJournalTopic(
  note: EditorNote,
  stored: DesktopJournalNote,
): EditorTopicDocument {
  const topic = resolveJournalTopic(note, { expectedNoteTitle: stored.journalDate })
  if (topic.topicId !== stored.topicId) {
    throw new Error(
      `Journal ${stored.journalDate} expected Topic ${stored.topicId}, but contains ${topic.topicId}`,
    )
  }
  return topic
}

function JournalDay({
  cache,
  first,
  item,
  onJournalSaved,
  today,
}: {
  cache: EditorNoteSessionCache
  first: boolean
  item: JournalFeedItem
  onJournalSaved: () => void
  today: JournalDate
}) {
  const { t } = useTranslation(['app', 'editor'])
  const configuration = useDesktopConfiguration()
  const { summary } = item
  const loadNote = useCallback(async () => {
    const note = await window.desktop.openJournal({ journalDate: summary.journalDate })
    if (note.id !== summary.noteId)
      throw new Error(`Journal ${summary.journalDate} changed its Note identity`)
    if (note.topicId !== summary.topicId)
      throw new Error(`Journal ${summary.journalDate} changed its Topic identity`)
    return note
  }, [summary.journalDate, summary.noteId, summary.topicId])
  const session = useEditorNoteSession<DesktopJournalNote>({
    cache,
    loadNote,
    noteId: summary.noteId,
    onSaved: onJournalSaved,
    resolveTopic: resolveStoredJournalTopic,
    topicKey: summary.topicId,
  })
  const adapters = useMemo(
    () => desktopEditorAdapters(configuration.networkImagePasteBehavior),
    [configuration.networkImagePasteBehavior],
  )

  let editorContent
  if (session.loadError) {
    editorContent = (
      <div {...stylex.props(journalRouteStyles.inlineStatus, journalRouteStyles.inlineError)} role="alert">
        <TriangleAlert {...stylex.props(journalRouteStyles.statusIcon)} aria-hidden="true" strokeWidth={1.7} />
        <span>{t('couldNotOpenJournal', { date: formatJournalHeading(summary.journalDate), message: session.loadError })}</span>
      </div>
    )
  }
  else if (!session.opened) {
    editorContent = (
      <div {...stylex.props(journalRouteStyles.inlineStatus)} role="status">
        <LoaderCircle
          {...stylex.props(journalRouteStyles.statusIcon, journalRouteStyles.loadingIcon)}
          aria-hidden="true"
          strokeWidth={1.7}
        />
        <span>{t('openingJournal')}</span>
      </div>
    )
  }
  else {
    editorContent = (
      <>
        {session.validationError
          ? (
              <div {...stylex.props(journalRouteStyles.validationError)} role="alert">
                {session.validationError.message}
              </div>
            )
          : null}
        {session.saveError
          ? (
              <div {...stylex.props(journalRouteStyles.validationError)} role="status">
                {t('failedToSaveNote', { message: session.saveError, ns: 'editor' })}
              </div>
            )
          : null}
        <JournalEditor
          adapters={adapters}
          note={session.opened.note}
          outline={{ outdentBehavior: configuration.outdentBehavior }}
        />
      </>
    )
  }

  return (
    <article
      {...stylex.props(journalRouteStyles.day, first && journalRouteStyles.firstDay)}
      aria-labelledby={`journal-heading-${summary.journalDate}`}
    >
      <header {...stylex.props(journalRouteStyles.dayHeader)}>
        <h2 id={`journal-heading-${summary.journalDate}`} {...stylex.props(journalRouteStyles.dayTitle)}>
          <time dateTime={summary.journalDate}>{formatJournalHeading(summary.journalDate)}</time>
          {summary.journalDate === today
            ? <span {...stylex.props(journalRouteStyles.todayLabel)}>{t('today')}</span>
            : null}
        </h2>
      </header>
      <div {...stylex.props(journalRouteStyles.editorRegion)}>{editorContent}</div>
    </article>
  )
}

function JournalsRoute() {
  const { t, i18n } = useTranslation(['app', 'common'])
  const configuration = useDesktopConfiguration()
  const { date: requestedDate } = Route.useSearch()
  const flushNotePersistence = useFlushNotePersistence()
  const queryClient = useQueryClient()
  const sessionCache = useMemo(
    () => createEditorNoteSessionCache(journalSessionCacheCapacity),
    [],
  )
  const scrollElementRef = useRef<HTMLDivElement>(null)
  const rolloverAnchorRef = useRef<JournalScrollAnchor | null>(null)
  const recordedJournalIdRef = useRef<string | null>(null)
  const requestedDateRef = useRef<JournalDate | null>(null)
  const selectJournalDateRef = useRef<(journalDate: JournalDate) => void>(() => undefined)
  const pendingScrollDateRef = useRef<JournalDate | null>(null)
  const [calendarOpen, setCalendarOpen] = useState(false)
  const [activeMonth, setActiveMonth] = useState(() => startOfJournalMonth(new Date()))
  const [scrollRequestVersion, setScrollRequestVersion] = useState(0)
  const [rolloverAnchorVersion, setRolloverAnchorVersion] = useState(0)
  const [selectedDate, setSelectedDate] = useState<JournalDate | null>(null)
  const [selectedJournal, setSelectedJournal] = useState<DesktopJournalSummary | null>(null)
  const [selectingDate, setSelectingDate] = useState(false)

  const todayQuery = useQuery({
    gcTime: 0,
    queryFn: async () => {
      await flushNotePersistence()
      const pruned = await window.desktop.prunePastEmptyJournals()
      pruned.deletedNoteIds.forEach(noteId => sessionCache.delete(noteId))
      return window.desktop.openJournal()
    },
    queryKey: journalQueryKeys.today,
    refetchOnMount: 'always',
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
    staleTime: 0,
  })
  const today = todayQuery.data
  const todayDate = today?.journalDate
  const retryInitialLoad = todayQuery.refetch
  const pastQuery = useInfiniteQuery({
    enabled: today !== undefined,
    getNextPageParam: (lastPage: DesktopJournalPage) => lastPage.nextCursor ?? undefined,
    initialPageParam: null as JournalDate | null,
    queryFn: ({ pageParam }) => window.desktop.listPastJournals({
      ...(pageParam === null ? {} : { before: pageParam }),
      limit: journalPageSize,
    }),
    queryKey: journalQueryKeys.feed,
  })
  const effectiveSelectedDate = selectedDate ?? today?.journalDate
  const monthBounds = useMemo(() => journalMonthBounds(activeMonth), [activeMonth])
  const datesQuery = useQuery({
    enabled: calendarOpen && today !== undefined,
    queryFn: () => window.desktop.listJournalDates(monthBounds),
    queryKey: journalQueryKeys.dates(monthBounds.from, monthBounds.through),
  })

  useEffect(() => () => sessionCache.clear(), [sessionCache])

  const feedItems = useMemo<readonly JournalFeedItem[]>(() => {
    if (!today)
      return []
    const byDate = new Map<JournalDate, JournalFeedItem>()
    byDate.set(today.journalDate, { summary: journalSummary(today) })
    for (const page of pastQuery.data?.pages ?? []) {
      for (const summary of page.items)
        byDate.set(summary.journalDate, { summary })
    }
    if (selectedJournal) {
      byDate.set(selectedJournal.journalDate, {
        summary: selectedJournal,
      })
    }
    return [...byDate.values()].sort((left, right) => (
      right.summary.journalDate.localeCompare(left.summary.journalDate)
    ))
  }, [pastQuery.data?.pages, selectedJournal, today])

  const knownDates = useMemo(() => {
    const dates = new Set<JournalDate>(datesQuery.data ?? [])
    if (today)
      dates.add(today.journalDate)
    return dates
  }, [datesQuery.data, today])

  const handleJournalSaved = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: journalQueryKeys.feed })
  }, [queryClient])
  const recordJournalOpened = useCallback((summary: DesktopJournalSummary) => {
    if (recordedJournalIdRef.current === summary.noteId)
      return
    recordedJournalIdRef.current = summary.noteId
    void window.desktop.recordNoteOpened({
      noteId: summary.noteId,
      topicId: summary.topicId,
    }).then(
      () => queryClient.invalidateQueries({ queryKey: noteQueryKeys.recent }),
      (error) => {
        if (recordedJournalIdRef.current === summary.noteId)
          recordedJournalIdRef.current = null
        console.error(`Failed to record Journal ${summary.journalDate} as opened`, error)
      },
    )
  }, [queryClient])
  const requestJournalScroll = useCallback((journalDate: JournalDate) => {
    pendingScrollDateRef.current = journalDate
    setScrollRequestVersion(version => version + 1)
  }, [])

  const selectJournalDate = useCallback((journalDate: JournalDate) => {
    if (!today || selectingDate)
      return
    if (journalDate > today.journalDate) {
      toast.error(t('couldNotOpenFutureJournal'))
      return
    }
    const existingItem = feedItems.find(item => item.summary.journalDate === journalDate)
    if (existingItem) {
      setSelectedDate(journalDate)
      setSelectedJournal(current => current?.journalDate === journalDate ? current : null)
      recordJournalOpened(existingItem.summary)
      requestJournalScroll(journalDate)
      return
    }
    setSelectingDate(true)
    void (async () => {
      await flushNotePersistence()
      const note = await window.desktop.openJournal({ journalDate })
      setSelectedDate(note.journalDate)
      const summary = journalSummary(note)
      setSelectedJournal(summary)
      recordJournalOpened(summary)
      requestJournalScroll(note.journalDate)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: journalQueryKeys.feed }),
        queryClient.invalidateQueries({ queryKey: journalQueryKeys.datesAll }),
      ])
    })().catch((error) => {
      console.error(`Failed to open Journal ${journalDate}`, error)
      toast.error(t('couldNotOpenJournal', {
        date: formatJournalHeading(journalDate),
        message: errorMessage(error),
      }))
    }).finally(() => setSelectingDate(false))
  }, [feedItems, flushNotePersistence, queryClient, recordJournalOpened, requestJournalScroll, selectingDate, t, today])
  selectJournalDateRef.current = selectJournalDate

  useEffect(() => {
    if (!requestedDate || !today || requestedDateRef.current === requestedDate)
      return
    requestedDateRef.current = requestedDate
    selectJournalDateRef.current(requestedDate)
  }, [requestedDate, today])

  useEffect(() => {
    if (!today || (requestedDate && requestedDate !== today.journalDate))
      return
    recordJournalOpened(journalSummary(today))
  }, [recordJournalOpened, requestedDate, today])

  useEffect(() => {
    if (!todayDate)
      return
    void queryClient.invalidateQueries({ queryKey: journalQueryKeys.feed })
  }, [queryClient, todayDate])

  useEffect(() => {
    if (!todayDate)
      return
    const recheckToday = () => {
      if (document.visibilityState !== 'visible')
        return
      void (async () => {
        const note = await window.desktop.openJournal()
        const previous = queryClient.getQueryData<DesktopJournalNote>(journalQueryKeys.today)
        if (previous?.journalDate === note.journalDate) {
          if (previous.id !== note.id)
            throw new Error(`Journal ${note.journalDate} changed its Note identity`)
          return
        }
        if (previous && previous.journalDate !== note.journalDate) {
          await queryClient.refetchQueries({
            queryKey: journalQueryKeys.feed,
            type: 'active',
          })
          const scrollElement = scrollElementRef.current
          rolloverAnchorRef.current = scrollElement
            ? captureJournalScrollAnchor(scrollElement)
            : null
          if (rolloverAnchorRef.current)
            setRolloverAnchorVersion(version => version + 1)
        }
        queryClient.setQueryData(journalQueryKeys.today, note)
      })().catch(error => console.error('Failed to refresh today\'s Journal', error))
    }
    const nextMidnight = fromJournalDate(todayDate)
    nextMidnight.setDate(nextMidnight.getDate() + 1)
    nextMidnight.setHours(0, 0, 1, 0)
    const timeout = window.setTimeout(recheckToday, Math.max(nextMidnight.getTime() - Date.now(), 1_000))
    window.addEventListener('focus', recheckToday)
    document.addEventListener('visibilitychange', recheckToday)
    return () => {
      window.clearTimeout(timeout)
      window.removeEventListener('focus', recheckToday)
      document.removeEventListener('visibilitychange', recheckToday)
    }
  }, [queryClient, todayDate])

  const virtualCount = feedItems.length + (pastQuery.hasNextPage ? 1 : 0)
  const getItemKey = useCallback((index: number) => {
    const item = feedItems[index]
    if (item)
      return item.summary.noteId
    if (index === feedItems.length && pastQuery.hasNextPage)
      return 'load-older-journals'
    throw new RangeError(`Virtual Journal row ${index} is outside the feed`)
  }, [feedItems, pastQuery.hasNextPage])
  const virtualizer = useVirtualizer({
    count: virtualCount,
    estimateSize: estimateJournalSize,
    getItemKey,
    getScrollElement: () => scrollElementRef.current,
    overscan: 2,
  })
  const virtualItems = virtualizer.getVirtualItems()
  const lastVirtualItem = virtualItems.at(-1)

  useLayoutEffect(() => {
    const anchor = rolloverAnchorRef.current
    if (!anchor)
      return
    const index = feedItems.findIndex(item => item.summary.noteId === anchor.noteId)
    if (index < 0) {
      rolloverAnchorRef.current = null
      return
    }
    const scrollElement = scrollElementRef.current
    if (!scrollElement)
      return

    virtualizer.scrollToIndex(index, { align: 'start' })
    let animationFrame = 0
    let remainingAttempts = 4
    const restore = () => {
      const row = findJournalRow(scrollElement, anchor.noteId)
      if (!row) {
        remainingAttempts -= 1
        if (remainingAttempts > 0)
          animationFrame = window.requestAnimationFrame(restore)
        return
      }
      const viewportTop = scrollElement.getBoundingClientRect().top
      const offsetDelta = row.getBoundingClientRect().top - viewportTop - anchor.viewportOffset
      if (Math.abs(offsetDelta) > 0.5)
        scrollElement.scrollTop += offsetDelta
      rolloverAnchorRef.current = null
    }
    animationFrame = window.requestAnimationFrame(restore)
    return () => window.cancelAnimationFrame(animationFrame)
  }, [feedItems, rolloverAnchorVersion, virtualizer])

  useEffect(() => {
    if (!lastVirtualItem
      || lastVirtualItem.index !== feedItems.length
      || !pastQuery.hasNextPage
      || pastQuery.isFetchingNextPage
      || pastQuery.isFetchNextPageError) {
      return
    }
    void pastQuery.fetchNextPage()
  }, [feedItems.length, lastVirtualItem, pastQuery])

  useEffect(() => {
    const pendingScrollDate = pendingScrollDateRef.current
    if (!pendingScrollDate)
      return
    const index = feedItems.findIndex(item => item.summary.journalDate === pendingScrollDate)
    if (index < 0)
      return
    virtualizer.scrollToIndex(index, { align: 'start' })
    pendingScrollDateRef.current = null
  }, [feedItems, scrollRequestVersion, virtualizer])

  const locale = i18n.resolvedLanguage
  if (!locale)
    throw new Error('Journal calendar requires a resolved application language')

  const openCalendar = useCallback(() => {
    if (!effectiveSelectedDate)
      return
    setActiveMonth(startOfJournalMonth(fromJournalDate(effectiveSelectedDate)))
    setCalendarOpen(true)
  }, [effectiveSelectedDate])
  const closeCalendar = useCallback(() => setCalendarOpen(false), [])
  const changeActiveMonth = useCallback((date: Date) => setActiveMonth(startOfJournalMonth(date)), [])
  const titlebar = useMemo(() => ({
    title: t('journals'),
    trailing: today && effectiveSelectedDate
      ? (
          <JournalCalendarControl
            activeMonth={activeMonth}
            calendarLabel={t('journalCalendarLabel')}
            close={closeCalendar}
            existingDates={knownDates}
            loadingDates={datesQuery.isFetching || selectingDate}
            locale={locale}
            nextMonthLabel={t('nextMonth')}
            open={calendarOpen}
            previousMonthLabel={t('previousMonth')}
            selectedDate={effectiveSelectedDate}
            today={today.journalDate}
            weekStart={configuration.weekStart}
            onActiveMonthChange={changeActiveMonth}
            onOpen={openCalendar}
            onSelectDate={selectJournalDate}
          />
        )
      : undefined,
  }), [
    activeMonth,
    calendarOpen,
    changeActiveMonth,
    closeCalendar,
    configuration.weekStart,
    datesQuery.isFetching,
    effectiveSelectedDate,
    knownDates,
    locale,
    openCalendar,
    selectJournalDate,
    selectingDate,
    t,
    today,
  ])
  usePageTitlebar(titlebar)

  if (todayQuery.isPending) {
    return (
      <main {...stylex.props(journalRouteStyles.initialStatus)} aria-label={t('journals')}>
        <LoaderCircle
          {...stylex.props(journalRouteStyles.statusIcon, journalRouteStyles.loadingIcon)}
          aria-hidden="true"
          strokeWidth={1.7}
        />
        <span role="status">{t('loadingJournals')}</span>
      </main>
    )
  }

  if (todayQuery.isError || !today) {
    return (
      <main {...stylex.props(journalRouteStyles.initialStatus)} aria-label={t('journals')}>
        <TriangleAlert
          {...stylex.props(journalRouteStyles.statusIcon)}
          aria-hidden="true"
          strokeWidth={1.7}
        />
        <span role="alert">{t('couldNotLoadJournals')}</span>
        <button
          {...stylex.props(journalRouteStyles.retryButton)}
          type="button"
          onClick={() => void retryInitialLoad()}
        >
          {t('tryAgain', { ns: 'common' })}
        </button>
      </main>
    )
  }

  return (
    <main {...stylex.props(journalRouteStyles.page)} aria-label={t('journals')}>
      <div {...stylex.props(journalRouteStyles.scrollEdge)} aria-hidden="true" />
      <div ref={scrollElementRef} {...stylex.props(journalRouteStyles.viewport)}>
        <div
          {...stylex.props(
            journalRouteStyles.feed,
            journalRouteStyles.feedHeight(virtualizer.getTotalSize()),
          )}
        >
          {virtualItems.map((virtualItem) => {
            const item = feedItems[virtualItem.index]
            if (!item) {
              if (virtualItem.index !== feedItems.length || !pastQuery.hasNextPage)
                throw new RangeError(`Missing virtual Journal row ${virtualItem.index}`)
              return (
                <div
                  key={virtualItem.key}
                  ref={virtualizer.measureElement}
                  {...stylex.props(
                    journalRouteStyles.virtualRow,
                    journalRouteStyles.virtualRowOffset(virtualItem.start),
                  )}
                  data-index={virtualItem.index}
                >
                  <div {...stylex.props(journalRouteStyles.feedStatus)}>
                    {pastQuery.isFetchNextPageError
                      ? (
                          <>
                            <TriangleAlert {...stylex.props(journalRouteStyles.statusIcon)} aria-hidden="true" strokeWidth={1.7} />
                            <span role="alert">{t('couldNotLoadOlderJournals')}</span>
                            <button
                              {...stylex.props(journalRouteStyles.retryButton)}
                              type="button"
                              onClick={() => void pastQuery.fetchNextPage()}
                            >
                              {t('tryAgain', { ns: 'common' })}
                            </button>
                          </>
                        )
                      : (
                          <>
                            <LoaderCircle
                              {...stylex.props(journalRouteStyles.statusIcon, journalRouteStyles.loadingIcon)}
                              aria-hidden="true"
                              strokeWidth={1.7}
                            />
                            <span role="status">{t('loadingOlderJournals')}</span>
                          </>
                        )}
                  </div>
                </div>
              )
            }
            return (
              <div
                key={virtualItem.key}
                ref={virtualizer.measureElement}
                {...stylex.props(
                  journalRouteStyles.virtualRow,
                  journalRouteStyles.virtualRowOffset(virtualItem.start),
                )}
                data-index={virtualItem.index}
                data-journal-note-id={item.summary.noteId}
              >
                <JournalDay
                  cache={sessionCache}
                  first={virtualItem.index === 0}
                  item={item}
                  today={today.journalDate}
                  onJournalSaved={handleJournalSaved}
                />
              </div>
            )
          })}
        </div>
      </div>
    </main>
  )
}
