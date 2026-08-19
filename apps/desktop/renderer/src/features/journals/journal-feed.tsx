import type { DesktopJournalSummary, JournalDate } from '@memorilo/desktop-api'
import type { Ref } from 'react'
import type { EditorNoteSessionCache } from '../notes/note-runtime'
import * as stylex from '@stylexjs/stylex'
import { useVirtualizer } from '@tanstack/react-virtual'
import { LoaderCircle, TriangleAlert } from 'lucide-react'
import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import { useTranslation } from 'react-i18next'
import { JournalDay } from './journal-day'
import { journalsPageStyles } from './journals-page.stylex'

const estimatedJournalHeight = 430

interface JournalScrollAnchor {
  noteId: string
  viewportOffset: number
}

export interface JournalFeedHandle {
  preserveViewportForRollover: () => void
  scrollToDate: (journalDate: JournalDate) => void
}

interface JournalFeedProps {
  cache: EditorNoteSessionCache
  focusBlockId?: string
  focusJournalDate?: JournalDate
  hasNextPage: boolean
  isFetchNextPageError: boolean
  isFetchingNextPage: boolean
  items: readonly DesktopJournalSummary[]
  onFetchNextPage: () => void
  onJournalSaved: () => void
  ref?: Ref<JournalFeedHandle>
  today: JournalDate
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
    if (bounds.bottom <= viewportTop)
      continue
    const noteId = row.dataset.journalNoteId
    if (!noteId)
      throw new Error('Rendered Journal row is missing its Note identity')
    return { noteId, viewportOffset: bounds.top - viewportTop }
  }
  return null
}

export function JournalFeed({
  cache,
  focusBlockId,
  focusJournalDate,
  hasNextPage,
  isFetchNextPageError,
  isFetchingNextPage,
  items,
  onFetchNextPage,
  onJournalSaved,
  ref,
  today,
}: JournalFeedProps) {
  const { t } = useTranslation(['app', 'common'])
  const scrollElementRef = useRef<HTMLDivElement>(null)
  const rolloverAnchorRef = useRef<JournalScrollAnchor | null>(null)
  const pendingScrollDateRef = useRef<JournalDate | null>(null)
  const [rolloverAnchorVersion, setRolloverAnchorVersion] = useState(0)
  const [scrollRequestVersion, setScrollRequestVersion] = useState(0)
  const virtualCount = items.length + (hasNextPage ? 1 : 0)
  const getItemKey = useCallback((index: number) => {
    const item = items[index]
    if (item)
      return item.noteId
    if (index === items.length && hasNextPage)
      return 'load-older-journals'
    throw new RangeError(`Virtual Journal row ${index} is outside the feed`)
  }, [hasNextPage, items])
  const virtualizer = useVirtualizer({
    count: virtualCount,
    estimateSize: () => estimatedJournalHeight,
    getItemKey,
    getScrollElement: () => scrollElementRef.current,
    overscan: 2,
  })
  const virtualItems = virtualizer.getVirtualItems()
  const lastVirtualItem = virtualItems.at(-1)

  useImperativeHandle(ref, () => ({
    preserveViewportForRollover: () => {
      const scrollElement = scrollElementRef.current
      rolloverAnchorRef.current = scrollElement
        ? captureJournalScrollAnchor(scrollElement)
        : null
      if (rolloverAnchorRef.current)
        setRolloverAnchorVersion(version => version + 1)
    },
    scrollToDate: (journalDate) => {
      pendingScrollDateRef.current = journalDate
      setScrollRequestVersion(version => version + 1)
    },
  }), [])

  useLayoutEffect(() => {
    const anchor = rolloverAnchorRef.current
    if (!anchor)
      return
    const index = items.findIndex(item => item.noteId === anchor.noteId)
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
  }, [items, rolloverAnchorVersion, virtualizer])

  useEffect(() => {
    if (!lastVirtualItem
      || lastVirtualItem.index !== items.length
      || !hasNextPage
      || isFetchingNextPage
      || isFetchNextPageError) {
      return
    }
    onFetchNextPage()
  }, [hasNextPage, isFetchNextPageError, isFetchingNextPage, items.length, lastVirtualItem, onFetchNextPage])

  useEffect(() => {
    const pendingScrollDate = pendingScrollDateRef.current
    if (!pendingScrollDate)
      return
    const index = items.findIndex(item => item.journalDate === pendingScrollDate)
    if (index < 0)
      return
    virtualizer.scrollToIndex(index, { align: 'start' })
    pendingScrollDateRef.current = null
  }, [items, scrollRequestVersion, virtualizer])

  return (
    <>
      <div {...stylex.props(journalsPageStyles.scrollEdge)} aria-hidden="true" />
      <div ref={scrollElementRef} {...stylex.props(journalsPageStyles.viewport)}>
        <div
          {...stylex.props(
            journalsPageStyles.feed,
            journalsPageStyles.feedHeight(virtualizer.getTotalSize()),
          )}
        >
          {virtualItems.map((virtualItem) => {
            const item = items[virtualItem.index]
            if (!item) {
              if (virtualItem.index !== items.length || !hasNextPage)
                throw new RangeError(`Missing virtual Journal row ${virtualItem.index}`)
              return (
                <div
                  key={virtualItem.key}
                  ref={virtualizer.measureElement}
                  {...stylex.props(
                    journalsPageStyles.virtualRow,
                    journalsPageStyles.virtualRowOffset(virtualItem.start),
                  )}
                  data-index={virtualItem.index}
                >
                  <div {...stylex.props(journalsPageStyles.feedStatus)}>
                    {isFetchNextPageError
                      ? (
                          <>
                            <TriangleAlert {...stylex.props(journalsPageStyles.statusIcon)} aria-hidden="true" strokeWidth={1.7} />
                            <span role="alert">{t('couldNotLoadOlderJournals')}</span>
                            <button
                              {...stylex.props(journalsPageStyles.retryButton)}
                              type="button"
                              onClick={onFetchNextPage}
                            >
                              {t('tryAgain', { ns: 'common' })}
                            </button>
                          </>
                        )
                      : (
                          <>
                            <LoaderCircle
                              {...stylex.props(journalsPageStyles.statusIcon, journalsPageStyles.loadingIcon)}
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
                  journalsPageStyles.virtualRow,
                  journalsPageStyles.virtualRowOffset(virtualItem.start),
                )}
                data-index={virtualItem.index}
                data-journal-note-id={item.noteId}
              >
                <JournalDay
                  cache={cache}
                  first={virtualItem.index === 0}
                  focusBlockId={item.journalDate === focusJournalDate ? focusBlockId : undefined}
                  summary={item}
                  today={today}
                  onJournalSaved={onJournalSaved}
                />
              </div>
            )
          })}
        </div>
      </div>
    </>
  )
}
