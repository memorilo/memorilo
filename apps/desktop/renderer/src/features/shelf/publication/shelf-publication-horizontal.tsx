import type { ShelfBrowseGroup, ShelfBrowseResult, ShelfPublication } from '@memorilo/shelf'
import type { RefObject } from 'react'
import * as stylex from '@stylexjs/stylex'
import { useInfiniteQuery } from '@tanstack/react-query'
import { useVirtualizer } from '@tanstack/react-virtual'
import { AlertCircle, BookOpen, LoaderCircle } from 'lucide-react'
import { useEffect, useMemo, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { desktopEffect, shelfEffectQuery } from '../shelf-query'
import { shelfSharedStyles } from '../shelf-shared.stylex'
import { ShelfPublicationItem } from './shelf-publication-card'
import {
  latestShelfBrowseIssue,
  matchingShelfPublications,
  nextShelfCatalogUrl,
  shelfBrowseIssueTranslation,
  uniqueShelfPublications,
} from './shelf-publication-collection'
import { shelfPublicationColumnGap, shelfPublicationWidth } from './shelf-publication-layout'
import { shelfPublicationStyles } from './shelf-publication.stylex'

export function ShelfPreviewState({
  isLoading,
  issue,
  publications,
  query,
}: {
  isLoading: boolean
  issue: ShelfBrowseGroup['issue']
  publications: readonly ShelfPublication[]
  query: string
}) {
  const { t } = useTranslation('app')
  const issueTranslation = issue === null ? null : shelfBrowseIssueTranslation(issue)
  const message = issueTranslation
    ? t(issueTranslation.key, issueTranslation.options)
    : query.trim().length > 0
      ? t('shelfNoMatchingBooksInSection')
      : t('shelfNoBooksListed')

  return (
    isLoading
      ? (
          <div {...stylex.props(shelfPublicationStyles.previewState)} role="status">
            <LoaderCircle {...stylex.props(shelfSharedStyles.spinner)} size={17} strokeWidth={1.8} aria-hidden="true" />
            <span>{t('shelfLoadingBooks')}</span>
          </div>
        )
      : publications.length === 0
        ? (
            <div {...stylex.props(shelfPublicationStyles.previewState)} role="status">
              {issue ? <AlertCircle size={16} strokeWidth={1.8} aria-hidden="true" /> : <BookOpen size={16} strokeWidth={1.7} aria-hidden="true" />}
              <span>{message}</span>
            </div>
          )
        : null
  )
}

export function HorizontalPublicationShelf({
  ariaLabel,
  includeNavigation,
  initialGroup,
  isVisible,
  query,
  scrollElementRef,
}: {
  ariaLabel: string
  includeNavigation: boolean
  initialGroup: ShelfBrowseGroup
  isVisible: boolean
  query: string
  scrollElementRef: RefObject<HTMLDivElement | null>
}) {
  const { t } = useTranslation('app')

  if (initialGroup.page === null)
    throw new Error(`Shelf source ${initialGroup.source.id} has no page to display`)

  const sourceId = initialGroup.source.id
  const initialPageUrl = initialGroup.page.selfUrl
  const rowRef = useRef<HTMLDivElement>(null)
  const initialData = useMemo<{ pageParams: string[], pages: ShelfBrowseResult[] }>(() => ({
    pageParams: [initialPageUrl],
    pages: [{ groups: [initialGroup], refreshedAt: null } satisfies ShelfBrowseResult],
  }), [initialGroup, initialPageUrl])
  const pagesQuery = useInfiniteQuery(shelfEffectQuery.infiniteQueryOptions({
    enabled: isVisible,
    getNextPageParam: (_lastPage, allPages, _lastPageParam, allPageParams) => (
      nextShelfCatalogUrl(allPages, allPageParams, sourceId, includeNavigation)
    ),
    initialData,
    initialPageParam: initialPageUrl,
    queryFn: ({ pageParam }) => desktopEffect('shelf.refresh-horizontal-page', () => (
      window.desktop.refreshShelfView({ pageUrl: pageParam, sourceId })
    )),
    queryKey: ['shelf-view', 'horizontal', sourceId, initialPageUrl, includeNavigation],
    retry: false,
    staleTime: 60_000,
  }))
  if (!pagesQuery.data)
    throw new Error('Shelf publication row query did not retain its initial page')
  const results = pagesQuery.data.pages
  const {
    fetchNextPage,
    hasNextPage,
    isFetchNextPageError,
    isFetchingNextPage,
  } = pagesQuery
  const publications = useMemo(
    () => matchingShelfPublications(uniqueShelfPublications(results, sourceId), query),
    [query, results, sourceId],
  )
  const browseIssue = latestShelfBrowseIssue(results, sourceId)
  const browseIssueTranslation = browseIssue === null ? null : shelfBrowseIssueTranslation(browseIssue)
  const hasStatusItem = hasNextPage || isFetchingNextPage || isFetchNextPageError || browseIssue !== null
  const virtualizer = useVirtualizer({
    count: publications.length + (hasStatusItem ? 1 : 0),
    estimateSize: () => shelfPublicationWidth + shelfPublicationColumnGap,
    getItemKey: (index) => {
      if (index === publications.length)
        return `status:${sourceId}`
      const publication = publications[index]
      if (!publication)
        throw new RangeError(`Shelf publication ${index} is outside the horizontal row`)

      return publication.id
    },
    getScrollElement: () => rowRef.current,
    horizontal: true,
    overscan: 3,
  })
  const virtualItems = virtualizer.getVirtualItems()
  const lastVirtualIndex = virtualItems.at(-1)?.index ?? -1

  useEffect(() => {
    if (
      !isVisible
      || !hasNextPage
      || isFetchingNextPage
      || isFetchNextPageError
      || lastVirtualIndex < publications.length - 2
    ) {
      return
    }
    void fetchNextPage()
  }, [
    fetchNextPage,
    hasNextPage,
    isVisible,
    isFetchNextPageError,
    isFetchingNextPage,
    lastVirtualIndex,
    publications.length,
  ])

  if (publications.length === 0 && !hasStatusItem)
    return <ShelfPreviewState isLoading={false} issue={null} publications={[]} query={query} />

  return (
    <div
      ref={rowRef}
      {...stylex.props(shelfPublicationStyles.horizontalShelfViewport)}
      aria-busy={isFetchingNextPage}
      aria-label={ariaLabel}
      role="region"
      tabIndex={0}
    >
      <div
        {...stylex.props(shelfPublicationStyles.horizontalShelfSizer)}
        style={{ width: virtualizer.getTotalSize() }}
      >
        {virtualItems.map((virtualItem) => {
          const isStatus = virtualItem.index === publications.length
          const publication = publications[virtualItem.index]
          if (!isStatus) {
            if (!publication)
              throw new RangeError(`Shelf publication ${virtualItem.index} is outside the horizontal row`)
            return (
              <div
                key={virtualItem.key}
                {...stylex.props(shelfPublicationStyles.horizontalShelfItem)}
                data-index={virtualItem.index}
                style={{ transform: `translateX(${virtualItem.start}px)` }}
              >
                <ShelfPublicationItem publication={publication} scrollElementRef={scrollElementRef} source={initialGroup.source} />
              </div>
            )
          }
          return (
            <div
              key={virtualItem.key}
              {...stylex.props(shelfPublicationStyles.horizontalShelfItem)}
              data-index={virtualItem.index}
              style={{ transform: `translateX(${virtualItem.start}px)` }}
            >
              <div {...stylex.props(shelfPublicationStyles.horizontalShelfStatus)} role="status">
                {isFetchNextPageError
                  ? (
                      <>
                        <AlertCircle size={18} strokeWidth={1.7} aria-hidden="true" />
                        <span>{t('shelfCouldNotLoadMoreBooks')}</span>
                        <button {...stylex.props(shelfPublicationStyles.horizontalRetry)} type="button" onClick={() => void fetchNextPage()}>{t('shelfTryAgain')}</button>
                      </>
                    )
                  : browseIssueTranslation && !hasNextPage
                    ? (
                        <>
                          <AlertCircle size={18} strokeWidth={1.7} aria-hidden="true" />
                          <span>{t(browseIssueTranslation.key, browseIssueTranslation.options)}</span>
                        </>
                      )
                    : (
                        <>
                          <LoaderCircle {...stylex.props(shelfSharedStyles.spinner)} size={20} strokeWidth={1.6} aria-hidden="true" />
                          <span>{t('shelfLoadingMoreBooks')}</span>
                        </>
                      )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
