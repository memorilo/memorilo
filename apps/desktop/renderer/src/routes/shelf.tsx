import type {
  AddShelfSourceInput,
  BrowseShelfInput,
  ShelfBrowseGroup,
  ShelfBrowseResult,
  ShelfNavigationItem,
  ShelfPublication,
  ShelfSource,
  UpdateShelfSourceInput,
} from '@memorilo/shelf'
import type { FormEvent, KeyboardEvent as ReactKeyboardEvent, RefObject } from 'react'
import * as stylex from '@stylexjs/stylex'
import { useInfiniteQuery, useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, getRouteApi, Link } from '@tanstack/react-router'
import { useVirtualizer } from '@tanstack/react-virtual'
import {
  AlertCircle,
  ArrowDown,
  BookOpen,
  Check,
  ChevronDown,
  ChevronRight,
  Globe2,
  KeyRound,
  LibraryBig,
  LoaderCircle,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  Trash2,
  X,
} from 'lucide-react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import {
  startTransition,
  useCallback,
  useDeferredValue,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { createPortal } from 'react-dom'

import { usePageTitlebar } from '../components/page-titlebar'
import { useShelfCover } from './-shelf-cover'
import { desktopEffect, shelfEffectQuery } from './-shelf-data'
import { cacheShelfPublication, shelfFormatName, shelfPublicationQueryKey } from './-shelf-publication'
import { shelfRouteStyles } from './-shelf.stylex'

const shelfTitlebar = { title: 'Shelf' } as const
const allSourcesId = 'all'
const maximumPublicationColumns = 9
const noSources: readonly ShelfSource[] = []
const preferredPublicationWidth = 140
const publicationColumnGap = 24
const shelfRouteApi = getRouteApi('/shelf')

interface ShelfRouteSearch {
  page?: string
  q?: string
  source?: string
}

function validateShelfSearch(search: Record<string, unknown>): ShelfRouteSearch {
  return {
    ...(typeof search.page === 'string' && search.page.length > 0 ? { page: search.page } : {}),
    ...(typeof search.q === 'string' && search.q.length > 0 ? { q: search.q } : {}),
    ...(typeof search.source === 'string' && search.source.length > 0 ? { source: search.source } : {}),
  }
}

const materialSpring = {
  bounce: 0,
  type: 'spring',
  visualDuration: 0.32,
} as const

const menuSpring = {
  bounce: 0,
  type: 'spring',
  visualDuration: 0.2,
} as const

const relativeTime = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })

function publicErrorMessage(error: Error | null): string | null {
  if (error === null)
    return null
  const line = error.message.split('\n').find(value => value.trim().length > 0)
  return line?.replace(/^Error:\s*/u, '') ?? 'Shelf operation failed.'
}

function updatedLabel(timestamp: number | null): string {
  if (timestamp === null)
    return 'Showing saved books'
  const seconds = Math.round((timestamp - Date.now()) / 1000)
  if (Math.abs(seconds) < 60)
    return 'Updated just now'
  const minutes = Math.round(seconds / 60)
  if (Math.abs(minutes) < 60)
    return `Updated ${relativeTime.format(minutes, 'minute')}`
  const hours = Math.round(minutes / 60)
  return `Updated ${relativeTime.format(hours, 'hour')}`
}

function useElementWidth(elementRef: RefObject<HTMLElement | null>): number {
  const [width, setWidth] = useState(0)

  useLayoutEffect(() => {
    const element = elementRef.current
    if (!element)
      return
    const update = () => setWidth(element.clientWidth)
    update()
    const observer = new ResizeObserver(update)
    observer.observe(element)
    return () => observer.disconnect()
  }, [elementRef])

  return width
}

function useDialogFocus({
  dialogRef,
  initialFocusRef,
  isPending,
  onClose,
  open,
}: {
  dialogRef: RefObject<HTMLElement | null>
  initialFocusRef: RefObject<HTMLElement | null>
  isPending: boolean
  onClose: () => void
  open: boolean
}): void {
  const isPendingRef = useRef(isPending)
  const onCloseRef = useRef(onClose)

  useEffect(() => {
    isPendingRef.current = isPending
    onCloseRef.current = onClose
  }, [isPending, onClose])

  useEffect(() => {
    if (!open)
      return

    const previouslyFocused = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null
    initialFocusRef.current?.focus()

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !isPendingRef.current) {
        event.preventDefault()
        onCloseRef.current()
        return
      }
      if (event.key !== 'Tab')
        return

      const dialog = dialogRef.current
      if (!dialog)
        return
      const focusable = [...dialog.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
      )].filter(element => !element.hasAttribute('hidden'))
      const first = focusable[0]
      const last = focusable.at(-1)
      if (!first || !last) {
        event.preventDefault()
        dialog.focus()
        return
      }
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      }
      else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      previouslyFocused?.focus()
    }
  }, [dialogRef, initialFocusRef, open])
}

function columnCount(width: number): number {
  const availableWidth = Math.max(width, preferredPublicationWidth)
  const columns = Math.floor((availableWidth + publicationColumnGap) / (preferredPublicationWidth + publicationColumnGap))
  return Math.max(2, Math.min(maximumPublicationColumns, columns))
}

function publicationGridTemplate(columns: number): string {
  return `repeat(${columns}, minmax(0, ${preferredPublicationWidth}px))`
}

function formatAuthors(publication: ShelfPublication): string {
  return publication.authors.length === 0 ? 'Unknown author' : publication.authors.join(', ')
}

function useLoadWhenVisible(rootRef: RefObject<HTMLElement | null>): [RefObject<HTMLDivElement | null>, boolean] {
  const elementRef = useRef<HTMLDivElement>(null)
  const [hasEnteredViewport, setHasEnteredViewport] = useState(false)

  useEffect(() => {
    if (hasEnteredViewport)
      return
    const element = elementRef.current
    const root = rootRef.current
    if (!element || !root)
      return

    const observer = new IntersectionObserver((entries) => {
      if (entries.some(entry => entry.isIntersecting))
        setHasEnteredViewport(true)
    }, {
      root,
      rootMargin: '80px 0px',
      threshold: 0.01,
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [hasEnteredViewport, rootRef])

  return [elementRef, hasEnteredViewport]
}

function PublicationCover({
  publication,
  scrollElementRef,
  sourceId,
}: {
  publication: ShelfPublication
  scrollElementRef: RefObject<HTMLDivElement | null>
  sourceId: string
}) {
  const [coverRef, shouldLoad] = useLoadWhenVisible(scrollElementRef)
  const cover = useShelfCover(sourceId, publication.coverUrl, shouldLoad)
  const statusLabel = cover.state === 'loading'
    ? `Loading cover for ${publication.title}`
    : cover.state === 'error'
      ? `Cover unavailable for ${publication.title}`
      : cover.state === 'missing'
        ? `No cover available for ${publication.title}`
        : `Cover for ${publication.title}`

  return (
    <div
      ref={coverRef}
      {...stylex.props(shelfRouteStyles.coverFrame)}
      aria-busy={cover.state === 'loading'}
      aria-label={statusLabel}
      data-cover-state={cover.state}
      role={cover.state === 'loading' || cover.state === 'error' ? 'status' : 'img'}
    >
      {cover.state === 'loaded' && cover.imageUrl
        ? <img {...stylex.props(shelfRouteStyles.coverImage)} alt="" decoding="async" height={348} loading="lazy" src={cover.imageUrl} width={240} />
        : (
            <div
              {...stylex.props(
                shelfRouteStyles.coverPlaceholder,
                cover.state === 'loading' && shelfRouteStyles.coverPlaceholderLoading,
                cover.state === 'error' && shelfRouteStyles.coverPlaceholderError,
              )}
              aria-hidden="true"
            >
              {cover.state === 'loading'
                ? <LoaderCircle {...stylex.props(shelfRouteStyles.spinner)} size={24} strokeWidth={1.45} />
                : cover.state === 'error'
                  ? <AlertCircle size={24} strokeWidth={1.45} />
                  : <BookOpen size={24} strokeWidth={1.35} />}
              <span {...stylex.props(shelfRouteStyles.coverPlaceholderTitle)}>{publication.title}</span>
              {cover.state === 'loading'
                ? <small {...stylex.props(shelfRouteStyles.coverPlaceholderStatus)}>Loading cover</small>
                : cover.state === 'error'
                  ? <small {...stylex.props(shelfRouteStyles.coverPlaceholderStatus)}>Cover unavailable</small>
                  : null}
            </div>
          )}
    </div>
  )
}

function PublicationItem({
  publication,
  scrollElementRef,
  source,
}: {
  publication: ShelfPublication
  scrollElementRef: RefObject<HTMLDivElement | null>
  source: ShelfSource
}) {
  const queryClient = useQueryClient()
  const format = publication.links.find(link => link.rel.includes('acquisition'))?.type
  const formatName = format ? shelfFormatName(format) : null
  const cacheDetails = () => queryClient.setQueryData(
    shelfPublicationQueryKey(source.id, publication.id),
    cacheShelfPublication(publication, source),
  )

  return (
    <Link
      {...stylex.props(shelfRouteStyles.publicationLink)}
      aria-label={`View details for ${publication.title}`}
      search={{ publication: publication.id, source: source.id }}
      to="/shelf/book"
      onClick={cacheDetails}
      onPointerDown={cacheDetails}
    >
      <article {...stylex.props(shelfRouteStyles.publication)}>
        <PublicationCover publication={publication} scrollElementRef={scrollElementRef} sourceId={source.id} />
        <div {...stylex.props(shelfRouteStyles.publicationText)}>
          <h3 {...stylex.props(shelfRouteStyles.publicationTitle)} title={publication.title}>{publication.title}</h3>
          <p {...stylex.props(shelfRouteStyles.publicationAuthor)} title={formatAuthors(publication)}>
            {formatAuthors(publication)}
          </p>
          {formatName
            ? <span {...stylex.props(shelfRouteStyles.formatLabel)}>{formatName}</span>
            : null}
        </div>
      </article>
    </Link>
  )
}

type ShelfVirtualRow = {
  group: ShelfBrowseGroup
  id: string
  kind: 'heading'
  publicationCount: number
} | {
  group: ShelfBrowseGroup
  id: string
  kind: 'publications'
  publications: readonly ShelfPublication[]
}

function virtualRows(
  groups: readonly ShelfBrowseGroup[],
  columns: number,
  searchQuery: string,
  showGroupHeadings: boolean,
): readonly ShelfVirtualRow[] {
  const normalizedQuery = searchQuery.trim().toLocaleLowerCase()
  const rows: ShelfVirtualRow[] = []
  for (const group of groups) {
    const publications = (group.page?.publications ?? []).filter((publication) => {
      if (normalizedQuery.length === 0)
        return true
      return publication.title.toLocaleLowerCase().includes(normalizedQuery)
        || publication.authors.some(author => author.toLocaleLowerCase().includes(normalizedQuery))
    })
    if (showGroupHeadings) {
      rows.push({
        group,
        id: `heading:${group.source.id}`,
        kind: 'heading',
        publicationCount: publications.length,
      })
    }
    for (let index = 0; index < publications.length; index += columns) {
      rows.push({
        group,
        id: `books:${group.source.id}:${index}`,
        kind: 'publications',
        publications: publications.slice(index, index + columns),
      })
    }
  }
  return rows
}

function VirtualShelf({
  groups,
  query,
  scrollElementRef,
  showGroupHeadings,
}: {
  groups: readonly ShelfBrowseGroup[]
  query: string
  scrollElementRef: RefObject<HTMLDivElement | null>
  showGroupHeadings: boolean
}) {
  const viewportWidth = useElementWidth(scrollElementRef)
  const columns = columnCount(viewportWidth)
  const rows = useMemo(
    () => virtualRows(groups, columns, query, showGroupHeadings),
    [columns, groups, query, showGroupHeadings],
  )
  const getItemKey = useCallback((index: number) => {
    const row = rows[index]
    if (!row)
      throw new RangeError(`Shelf virtual row ${index} is outside the collection`)
    return row.id
  }, [rows])
  const estimateSize = useCallback((index: number) => rows[index]?.kind === 'heading' ? 74 : 306, [rows])
  const virtualizer = useVirtualizer({
    count: rows.length,
    estimateSize,
    getItemKey,
    getScrollElement: () => scrollElementRef.current,
    overscan: 2,
  })

  return (
    <div {...stylex.props(shelfRouteStyles.virtualSizer)} style={{ height: virtualizer.getTotalSize() }}>
      {virtualizer.getVirtualItems().map((virtualItem) => {
        const row = rows[virtualItem.index]
        if (!row)
          throw new RangeError(`Shelf virtual row ${virtualItem.index} is outside the collection`)
        return (
          <div
            key={row.id}
            ref={virtualizer.measureElement}
            {...stylex.props(shelfRouteStyles.virtualRow)}
            data-index={virtualItem.index}
            style={{ transform: `translateY(${virtualItem.start}px)` }}
          >
            {row.kind === 'heading'
              ? (
                  <section {...stylex.props(shelfRouteStyles.groupHeading)} aria-label={row.group.source.name}>
                    <div {...stylex.props(shelfRouteStyles.groupTitleLine)}>
                      <span {...stylex.props(shelfRouteStyles.sourceGlyph)} aria-hidden="true">
                        <Globe2 size={15} strokeWidth={1.8} />
                      </span>
                      <h2 {...stylex.props(shelfRouteStyles.groupTitle)}>{row.group.source.name}</h2>
                      {row.publicationCount > 0 || row.group.page?.navigation.length === 0
                        ? <span {...stylex.props(shelfRouteStyles.groupCount)}>{row.publicationCount}</span>
                        : null}
                    </div>
                    {row.group.issue
                      ? (
                          <div {...stylex.props(shelfRouteStyles.inlineIssue)} role="status">
                            <AlertCircle size={14} strokeWidth={1.9} aria-hidden="true" />
                            <span>{row.group.issue.message}</span>
                          </div>
                        )
                      : null}
                  </section>
                )
              : (
                  <div
                    {...stylex.props(shelfRouteStyles.publicationRow)}
                    style={{ gridTemplateColumns: publicationGridTemplate(columns) }}
                  >
                    {row.publications.map(publication => (
                      <PublicationItem
                        key={publication.id}
                        publication={publication}
                        scrollElementRef={scrollElementRef}
                        source={row.group.source}
                      />
                    ))}
                  </div>
                )}
          </div>
        )
      })}
    </div>
  )
}

function matchingPublications(
  publications: readonly ShelfPublication[],
  searchQuery: string,
): readonly ShelfPublication[] {
  const normalizedQuery = searchQuery.trim().toLocaleLowerCase()
  if (normalizedQuery.length === 0)
    return publications
  return publications.filter(publication => (
    publication.title.toLocaleLowerCase().includes(normalizedQuery)
    || publication.authors.some(author => author.toLocaleLowerCase().includes(normalizedQuery))
  ))
}

function groupFromResult(result: ShelfBrowseResult, sourceId: string): ShelfBrowseGroup {
  const group = result.groups.find(candidate => candidate.source.id === sourceId)
  if (!group)
    throw new Error(`Shelf result is missing source ${sourceId}`)
  return group
}

function nextUnvisitedCatalogUrl(
  results: readonly ShelfBrowseResult[],
  pageUrls: readonly string[],
  sourceId: string,
  includeNavigation: boolean,
): string | undefined {
  const visited = new Set(pageUrls)
  const pages = results
    .map(result => groupFromResult(result, sourceId).page)
    .filter(page => page !== null)
  const orderedPages = [...pages].reverse()

  for (const page of orderedPages) {
    const navigationUrls = includeNavigation ? page.navigation.map(item => item.href) : []
    const paginationUrls = page.nextUrl === null ? [] : [page.nextUrl]
    // Navigation-only feeds are indexes: descend until books are found before paginating the index itself.
    const candidates = page.publications.length === 0
      ? [...navigationUrls, ...paginationUrls]
      : [...paginationUrls, ...navigationUrls]
    const nextUrl = candidates.find(url => !visited.has(url))
    if (nextUrl)
      return nextUrl
  }
  return undefined
}

function uniquePublications(results: readonly ShelfBrowseResult[], sourceId: string): readonly ShelfPublication[] {
  const publications = new Map<string, ShelfPublication>()
  for (const result of results) {
    const page = groupFromResult(result, sourceId).page
    if (page === null)
      continue
    for (const publication of page.publications)
      publications.set(publication.id, publication)
  }
  return [...publications.values()]
}

function latestBrowseIssue(results: readonly ShelfBrowseResult[], sourceId: string): ShelfBrowseGroup['issue'] {
  for (let index = results.length - 1; index >= 0; index -= 1) {
    const result = results[index]
    if (!result)
      throw new RangeError(`Shelf result ${index} is outside the horizontal query`)
    const issue = groupFromResult(result, sourceId).issue
    if (issue)
      return issue
  }
  return null
}

function HorizontalPublicationShelf({
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
  if (initialGroup.page === null)
    throw new Error(`Shelf source ${initialGroup.source.id} has no page to display`)

  const sourceId = initialGroup.source.id
  const initialPageUrl = initialGroup.page.selfUrl
  const rowRef = useRef<HTMLDivElement>(null)
  const initialData = useMemo<{ pageParams: string[], pages: ShelfBrowseResult[] }>(() => ({
    pageParams: [initialPageUrl],
    pages: [{ groups: [initialGroup], refreshedAt: null } satisfies ShelfBrowseResult],
  }), [initialGroup, initialPageUrl])
  const pagesQuery = useInfiniteQuery({
    enabled: isVisible,
    getNextPageParam: (_lastPage, allPages, _lastPageParam, allPageParams) => (
      nextUnvisitedCatalogUrl(allPages, allPageParams, sourceId, includeNavigation)
    ),
    initialData,
    initialPageParam: initialPageUrl,
    queryFn: async ({ pageParam }) => window.desktop.refreshShelfView({ pageUrl: pageParam, sourceId }),
    queryKey: ['shelf-view', 'horizontal', sourceId, initialPageUrl, includeNavigation],
    retry: false,
    staleTime: 60_000,
  })
  const results = pagesQuery.data.pages
  const {
    fetchNextPage,
    hasNextPage,
    isFetchNextPageError,
    isFetchingNextPage,
  } = pagesQuery
  const publications = useMemo(
    () => matchingPublications(uniquePublications(results, sourceId), query),
    [query, results, sourceId],
  )
  const browseIssue = latestBrowseIssue(results, sourceId)
  const hasStatusItem = hasNextPage || isFetchingNextPage || isFetchNextPageError || browseIssue !== null
  const virtualizer = useVirtualizer({
    count: publications.length + (hasStatusItem ? 1 : 0),
    estimateSize: () => preferredPublicationWidth + publicationColumnGap,
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
    return <PreviewState isLoading={false} issue={null} publications={[]} query={query} />

  return (
    <div
      ref={rowRef}
      {...stylex.props(shelfRouteStyles.horizontalShelfViewport)}
      aria-busy={isFetchingNextPage}
      aria-label={ariaLabel}
      role="region"
      tabIndex={0}
    >
      <div
        {...stylex.props(shelfRouteStyles.horizontalShelfSizer)}
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
                {...stylex.props(shelfRouteStyles.horizontalShelfItem)}
                data-index={virtualItem.index}
                style={{ transform: `translateX(${virtualItem.start}px)` }}
              >
                <PublicationItem publication={publication} scrollElementRef={scrollElementRef} source={initialGroup.source} />
              </div>
            )
          }
          return (
            <div
              key={virtualItem.key}
              {...stylex.props(shelfRouteStyles.horizontalShelfItem)}
              data-index={virtualItem.index}
              style={{ transform: `translateX(${virtualItem.start}px)` }}
            >
              <div {...stylex.props(shelfRouteStyles.horizontalShelfStatus)} role="status">
                {isFetchNextPageError
                  ? (
                      <>
                        <AlertCircle size={18} strokeWidth={1.7} aria-hidden="true" />
                        <span>Couldn’t load more books.</span>
                        <button {...stylex.props(shelfRouteStyles.horizontalRetry)} type="button" onClick={() => void fetchNextPage()}>Try Again</button>
                      </>
                    )
                  : browseIssue && !hasNextPage
                    ? (
                        <>
                          <AlertCircle size={18} strokeWidth={1.7} aria-hidden="true" />
                          <span>{browseIssue.message}</span>
                        </>
                      )
                    : (
                        <>
                          <LoaderCircle {...stylex.props(shelfRouteStyles.spinner)} size={20} strokeWidth={1.6} aria-hidden="true" />
                          <span>Loading more books…</span>
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

function useShelfPreview(sourceId: string, pageUrl: string | null, enabled: boolean) {
  return useQuery(shelfEffectQuery.queryOptions({
    enabled: enabled && pageUrl !== null,
    queryFn: () => desktopEffect(() => {
      if (pageUrl === null)
        throw new Error('Shelf preview page URL is missing')
      return window.desktop.refreshShelfView({ pageUrl, sourceId })
    }),
    queryKey: ['shelf-view', 'preview', sourceId, pageUrl],
    retry: false,
    staleTime: 60_000,
  }))
}

function PreviewState({
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
  return (
    isLoading
      ? (
          <div {...stylex.props(shelfRouteStyles.previewState)} role="status">
            <LoaderCircle {...stylex.props(shelfRouteStyles.spinner)} size={17} strokeWidth={1.8} aria-hidden="true" />
            <span>Loading books…</span>
          </div>
        )
      : publications.length === 0
        ? (
            <div {...stylex.props(shelfRouteStyles.previewState)} role="status">
              {issue ? <AlertCircle size={16} strokeWidth={1.8} aria-hidden="true" /> : <BookOpen size={16} strokeWidth={1.7} aria-hidden="true" />}
              <span>{issue?.message ?? (query.trim().length > 0 ? 'No matching books in this section.' : 'No books are listed here yet.')}</span>
            </div>
          )
        : null
  )
}

function CategoryPreviewContent({
  ariaLabel,
  isVisible,
  pageUrl,
  query,
  scrollElementRef,
  sourceId,
}: {
  ariaLabel: string
  isVisible: boolean
  pageUrl: string
  query: string
  scrollElementRef: RefObject<HTMLDivElement | null>
  sourceId: string
}) {
  const previewQuery = useShelfPreview(sourceId, pageUrl, isVisible)
  const group = previewQuery.data?.groups.find(candidate => candidate.source.id === sourceId)

  if (!isVisible || previewQuery.isPending) {
    return <PreviewState isLoading issue={null} publications={[]} query={query} />
  }

  if (!group)
    throw new Error(`Shelf preview is missing source ${sourceId}`)

  if (group.page === null) {
    return <PreviewState isLoading={false} issue={group.issue} publications={[]} query={query} />
  }

  return (
    <HorizontalPublicationShelf
      ariaLabel={ariaLabel}
      includeNavigation
      initialGroup={group}
      isVisible={isVisible}
      query={query}
      scrollElementRef={scrollElementRef}
    />
  )
}

function SourcePreviewSection({
  group,
  onBrowseSource,
  query,
  scrollElementRef,
}: {
  group: ShelfBrowseGroup
  onBrowseSource: (sourceId: string) => void
  query: string
  scrollElementRef: RefObject<HTMLDivElement | null>
}) {
  const [visibilityRef, isVisible] = useLoadWhenVisible(scrollElementRef)

  return (
    <div ref={visibilityRef}>
      <section {...stylex.props(shelfRouteStyles.overviewSection)} aria-label={group.source.name} role="region">
        <header {...stylex.props(shelfRouteStyles.overviewHeader)}>
          <button
            {...stylex.props(shelfRouteStyles.overviewHeadingAction)}
            aria-label={`Open ${group.source.name}`}
            type="button"
            onClick={() => onBrowseSource(group.source.id)}
          >
            <span {...stylex.props(shelfRouteStyles.sourceGlyph)} aria-hidden="true">
              <Globe2 size={15} strokeWidth={1.8} />
            </span>
            <div {...stylex.props(shelfRouteStyles.overviewTitleStack)}>
              <h2 {...stylex.props(shelfRouteStyles.overviewTitle)}>{group.source.name}</h2>
            </div>
            <ChevronRight {...stylex.props(shelfRouteStyles.catalogChevron)} size={14} strokeWidth={1.9} aria-hidden="true" />
          </button>
        </header>
        {group.page
          ? (
              <HorizontalPublicationShelf
                ariaLabel={`Books from ${group.source.name}`}
                includeNavigation
                initialGroup={group}
                isVisible={isVisible}
                query={query}
                scrollElementRef={scrollElementRef}
              />
            )
          : <PreviewState isLoading={false} issue={group.issue} publications={[]} query={query} />}
      </section>
    </div>
  )
}

function CategoryPreviewSection({
  category,
  onBrowseCategory,
  query,
  scrollElementRef,
  sourceId,
}: {
  category: ShelfNavigationItem
  onBrowseCategory: (sourceId: string, pageUrl: string) => void
  query: string
  scrollElementRef: RefObject<HTMLDivElement | null>
  sourceId: string
}) {
  const [visibilityRef, isVisible] = useLoadWhenVisible(scrollElementRef)

  return (
    <div ref={visibilityRef}>
      <section {...stylex.props(shelfRouteStyles.overviewSection)} aria-label={category.title} role="region">
        <button {...stylex.props(shelfRouteStyles.catalogSectionHeader)} type="button" onClick={() => onBrowseCategory(sourceId, category.href)}>
          <span {...stylex.props(shelfRouteStyles.overviewTitleStack)}>
            <span {...stylex.props(shelfRouteStyles.overviewTitle)}>{category.title}</span>
            {category.subtitle ? <span {...stylex.props(shelfRouteStyles.overviewSubtitle)}>{category.subtitle}</span> : null}
          </span>
          <ChevronRight {...stylex.props(shelfRouteStyles.catalogChevron)} size={14} strokeWidth={1.9} aria-hidden="true" />
        </button>
        <CategoryPreviewContent
          ariaLabel={`Books in ${category.title}`}
          isVisible={isVisible}
          pageUrl={category.href}
          query={query}
          scrollElementRef={scrollElementRef}
          sourceId={sourceId}
        />
      </section>
    </div>
  )
}

function AllSourcesOverview({
  groups,
  onBrowseSource,
  query,
  scrollElementRef,
}: {
  groups: readonly ShelfBrowseGroup[]
  onBrowseSource: (sourceId: string) => void
  query: string
  scrollElementRef: RefObject<HTMLDivElement | null>
}) {
  return (
    <div {...stylex.props(shelfRouteStyles.overviewCollection)}>
      {groups.map(group => (
        <SourcePreviewSection
          key={group.source.id}
          group={group}
          onBrowseSource={onBrowseSource}
          query={query}
          scrollElementRef={scrollElementRef}
        />
      ))}
    </div>
  )
}

function SourceOverview({
  group,
  onBrowseCategory,
  query,
  scrollElementRef,
}: {
  group: ShelfBrowseGroup
  onBrowseCategory: (sourceId: string, pageUrl: string) => void
  query: string
  scrollElementRef: RefObject<HTMLDivElement | null>
}) {
  const hasRootPublicationFeed = group.page !== null
    && (group.page.publications.length > 0 || group.page.nextUrl !== null)
  return (
    <div {...stylex.props(shelfRouteStyles.overviewCollection)}>
      <header {...stylex.props(shelfRouteStyles.browserHeader)}>
        <h1 {...stylex.props(shelfRouteStyles.browserTitle)}>{group.page?.title ?? group.source.name}</h1>
        {group.page?.subtitle ? <p {...stylex.props(shelfRouteStyles.browserSubtitle)}>{group.page.subtitle}</p> : null}
      </header>
      {hasRootPublicationFeed
        ? (
            <section {...stylex.props(shelfRouteStyles.overviewSection)} aria-label="All Books" role="region">
              <header {...stylex.props(shelfRouteStyles.overviewHeader)}>
                <h2 {...stylex.props(shelfRouteStyles.overviewTitle)}>Books</h2>
              </header>
              <HorizontalPublicationShelf
                ariaLabel={`Books in ${group.page?.title ?? group.source.name}`}
                includeNavigation={false}
                initialGroup={group}
                isVisible
                query={query}
                scrollElementRef={scrollElementRef}
              />
            </section>
          )
        : null}
      {group.page?.navigation.map(category => (
        <CategoryPreviewSection
          key={category.href}
          category={category}
          onBrowseCategory={onBrowseCategory}
          query={query}
          scrollElementRef={scrollElementRef}
          sourceId={group.source.id}
        />
      ))}
    </div>
  )
}

function SourceMenu({
  onClose,
  onManage,
  onSelect,
  open,
  selectedSourceId,
  sources,
}: {
  onClose: () => void
  onManage: () => void
  onSelect: (sourceId: string | null) => void
  open: boolean
  selectedSourceId: string | null
  sources: readonly ShelfSource[]
}) {
  const menuRef = useRef<HTMLDivElement>(null)
  const shouldReduceMotion = useReducedMotion()
  const animate = shouldReduceMotion ? { opacity: 1 } : { filter: 'blur(0px)', opacity: 1, scale: 1, y: 0 }
  const exit = shouldReduceMotion ? { opacity: 0 } : { filter: 'blur(3px)', opacity: 0, scale: 0.97, y: -5 }

  useEffect(() => {
    if (!open)
      return
    const menuItems = [...(menuRef.current?.querySelectorAll<HTMLElement>('[role^="menuitem"]') ?? [])]
    const selected = menuItems.find(item => item.getAttribute('aria-checked') === 'true') ?? menuItems[0]
    selected?.focus()
  }, [open])

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const menuItems = [...event.currentTarget.querySelectorAll<HTMLElement>('[role^="menuitem"]')]
    const currentIndex = menuItems.findIndex(item => item === document.activeElement)
    const targetIndex = event.key === 'ArrowDown'
      ? (currentIndex + 1) % menuItems.length
      : event.key === 'ArrowUp'
        ? (currentIndex - 1 + menuItems.length) % menuItems.length
        : event.key === 'Home'
          ? 0
          : event.key === 'End'
            ? menuItems.length - 1
            : null
    if (targetIndex !== null) {
      event.preventDefault()
      menuItems[targetIndex]?.focus()
    }
    else if (event.key === 'Escape') {
      event.preventDefault()
      onClose()
    }
  }

  return (
    <AnimatePresence>
      {open
        ? (
            <motion.div
              ref={menuRef}
              {...stylex.props(shelfRouteStyles.sourceMenu)}
              animate={animate}
              aria-label="Book sources"
              exit={exit}
              initial={exit}
              role="menu"
              transition={shouldReduceMotion ? { duration: 0.12 } : menuSpring}
              onKeyDown={handleKeyDown}
            >
              <button
                {...stylex.props(shelfRouteStyles.sourceMenuItem, selectedSourceId === null && shelfRouteStyles.sourceMenuItemSelected)}
                role="menuitemradio"
                aria-checked={selectedSourceId === null}
                type="button"
                onClick={() => onSelect(null)}
              >
                <LibraryBig size={16} strokeWidth={1.8} aria-hidden="true" />
                <span {...stylex.props(shelfRouteStyles.sourceMenuLabel)}>All Sources</span>
                {selectedSourceId === null ? <Check size={15} strokeWidth={2} aria-hidden="true" /> : null}
              </button>
              <div {...stylex.props(shelfRouteStyles.menuSeparator)} />
              <div {...stylex.props(shelfRouteStyles.sourceMenuScroll)}>
                {sources.map(source => (
                  <button
                    key={source.id}
                    {...stylex.props(shelfRouteStyles.sourceMenuItem, selectedSourceId === source.id && shelfRouteStyles.sourceMenuItemSelected)}
                    aria-checked={selectedSourceId === source.id}
                    role="menuitemradio"
                    type="button"
                    onClick={() => onSelect(source.id)}
                  >
                    <Globe2 size={16} strokeWidth={1.8} aria-hidden="true" />
                    <span {...stylex.props(shelfRouteStyles.sourceMenuLabel)}>
                      <strong>{source.name}</strong>
                      <small>{source.username ?? new URL(source.url).host}</small>
                    </span>
                    {selectedSourceId === source.id ? <Check size={15} strokeWidth={2} aria-hidden="true" /> : null}
                  </button>
                ))}
              </div>
              <div {...stylex.props(shelfRouteStyles.menuSeparator)} />
              <button {...stylex.props(shelfRouteStyles.sourceMenuItem)} role="menuitem" type="button" onClick={onManage}>
                <Settings2 size={16} strokeWidth={1.8} aria-hidden="true" />
                <span {...stylex.props(shelfRouteStyles.sourceMenuLabel)}>Manage Sources…</span>
              </button>
            </motion.div>
          )
        : null}
    </AnimatePresence>
  )
}

function SourceManagerSheet({
  addError,
  initialMode,
  isPending,
  onAdd,
  onClose,
  onRemove,
  onUpdate,
  open,
  sources,
  updateError,
}: {
  addError: Error | null
  initialMode: 'add' | 'list'
  isPending: boolean
  onAdd: (input: AddShelfSourceInput) => Promise<void>
  onClose: () => void
  onRemove: (source: ShelfSource) => void
  onUpdate: (input: UpdateShelfSourceInput) => Promise<void>
  open: boolean
  sources: readonly ShelfSource[]
  updateError: Error | null
}) {
  const [editor, setEditor] = useState<'add' | ShelfSource | null>(initialMode === 'add' ? 'add' : null)
  const [showAccount, setShowAccount] = useState(false)
  const dialogRef = useRef<HTMLElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const urlInputRef = useRef<HTMLInputElement>(null)
  const shouldReduceMotion = useReducedMotion()
  const sheetAnimate = shouldReduceMotion ? { opacity: 1 } : { filter: 'blur(0px)', opacity: 1, scale: 1, y: 0 }
  const sheetExit = shouldReduceMotion ? { opacity: 0 } : { filter: 'blur(2px)', opacity: 0, scale: 0.98, y: 10 }

  useDialogFocus({
    dialogRef,
    initialFocusRef: initialMode === 'add' ? urlInputRef : closeButtonRef,
    isPending,
    onClose,
    open,
  })

  const openEditor = (value: 'add' | ShelfSource) => {
    setEditor(value)
    setShowAccount(value !== 'add' && value.auth === 'basic')
    requestAnimationFrame(() => urlInputRef.current?.focus())
  }

  const cancelEditor = () => {
    if (editor === 'add' && initialMode === 'add') {
      onClose()
      return
    }
    setEditor(null)
    requestAnimationFrame(() => closeButtonRef.current?.focus())
  }

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const data = new FormData(event.currentTarget)
    const url = data.get('url')
    const name = data.get('name')
    const username = data.get('username')
    const password = data.get('password')
    if (typeof url !== 'string' || typeof name !== 'string')
      throw new TypeError('Shelf source URL is missing')
    const credentials = {
      ...(showAccount && typeof password === 'string' && password.length > 0 ? { password } : {}),
      ...(showAccount && typeof username === 'string' ? { username } : {}),
    }
    if (editor === 'add') {
      try {
        await onAdd({
          ...(name.trim().length > 0 ? { name } : {}),
          ...credentials,
          url,
        })
      }
      catch {
        return
      }
      onClose()
      return
    }
    else if (editor) {
      try {
        await onUpdate({
          clearCredentials: !showAccount,
          id: editor.id,
          name,
          ...credentials,
          url,
        })
      }
      catch {
        return
      }
    }
    setEditor(null)
  }

  const error = editor === 'add' ? addError : updateError
  const editorSource = editor === 'add' || editor === null ? null : editor
  const title = editor === 'add' ? 'Add Book Source' : editorSource ? 'Edit Book Source' : 'Book Sources'

  return (
    <AnimatePresence>
      {open
        ? (
            <motion.div
              {...stylex.props(shelfRouteStyles.sheetLayer)}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              initial={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
            >
              <button
                {...stylex.props(shelfRouteStyles.sheetScrim)}
                aria-label="Close Book Sources"
                disabled={isPending}
                type="button"
                onClick={onClose}
              />
              <motion.section
                ref={dialogRef}
                {...stylex.props(shelfRouteStyles.sheet)}
                animate={sheetAnimate}
                aria-labelledby="add-source-title"
                aria-modal="true"
                exit={sheetExit}
                initial={sheetExit}
                role="dialog"
                tabIndex={-1}
                transition={shouldReduceMotion ? { duration: 0.16 } : materialSpring}
              >
                <header {...stylex.props(shelfRouteStyles.sheetHeader)}>
                  <div {...stylex.props(shelfRouteStyles.managerHeading)}>
                    <div>
                      <h2 id="add-source-title" {...stylex.props(shelfRouteStyles.sheetTitle)}>{title}</h2>
                      <p {...stylex.props(shelfRouteStyles.sheetSubtitle)}>
                        {editor === null
                          ? 'Choose a source to update its address or sign-in.'
                          : 'OPDS listings stay remote and are cached only for browsing.'}
                      </p>
                    </div>
                  </div>
                  {editor === null
                    ? (
                        <button
                          ref={closeButtonRef}
                          {...stylex.props(shelfRouteStyles.iconButton)}
                          aria-label="Close"
                          disabled={isPending}
                          type="button"
                          onClick={onClose}
                        >
                          <X size={17} strokeWidth={1.9} aria-hidden="true" />
                        </button>
                      )
                    : null}
                </header>
                {editor === null
                  ? (
                      <div {...stylex.props(shelfRouteStyles.managerBody)}>
                        <div {...stylex.props(shelfRouteStyles.managerList)}>
                          {sources.map(source => (
                            <div key={source.id} {...stylex.props(shelfRouteStyles.managerSourceRow)}>
                              <span {...stylex.props(shelfRouteStyles.managerSourceIcon)} aria-hidden="true">
                                <Globe2 size={17} strokeWidth={1.8} />
                              </span>
                              <button
                                {...stylex.props(shelfRouteStyles.managerSourceDetails)}
                                type="button"
                                onClick={() => openEditor(source)}
                              >
                                <strong>{source.name}</strong>
                                <span>{source.username ? `${new URL(source.url).host} · ${source.username}` : new URL(source.url).host}</span>
                              </button>
                              <button
                                {...stylex.props(shelfRouteStyles.iconButton)}
                                aria-label={`Edit ${source.name}`}
                                title={`Edit ${source.name}`}
                                type="button"
                                onClick={() => openEditor(source)}
                              >
                                <Settings2 size={16} strokeWidth={1.8} aria-hidden="true" />
                              </button>
                              <button
                                {...stylex.props(shelfRouteStyles.managerRemoveButton)}
                                aria-label={`Remove ${source.name}`}
                                title={`Remove ${source.name}`}
                                type="button"
                                onClick={() => onRemove(source)}
                              >
                                <Trash2 size={15} strokeWidth={1.8} aria-hidden="true" />
                              </button>
                            </div>
                          ))}
                        </div>
                        <footer {...stylex.props(shelfRouteStyles.managerActions)}>
                          <button {...stylex.props(shelfRouteStyles.primaryButton)} type="button" onClick={() => openEditor('add')}>
                            <Plus size={16} strokeWidth={1.9} aria-hidden="true" />
                            Add Book Source
                          </button>
                        </footer>
                      </div>
                    )
                  : (
                      <form key={editor === 'add' ? 'add' : editor.id} {...stylex.props(shelfRouteStyles.sourceForm)} onSubmit={event => void submit(event)}>
                        <label {...stylex.props(shelfRouteStyles.field)}>
                          <span>OPDS address</span>
                          <input
                            ref={urlInputRef}
                            {...stylex.props(shelfRouteStyles.textInput)}
                            autoComplete="url"
                            defaultValue={editorSource?.url}
                            name="url"
                            placeholder="https://example.com/opds"
                            required
                            type="url"
                          />
                        </label>
                        <label {...stylex.props(shelfRouteStyles.field)}>
                          <span>
                            Name
                            {editor === 'add' ? <small {...stylex.props(shelfRouteStyles.fieldOptional)}>Optional</small> : null}
                          </span>
                          <input
                            {...stylex.props(shelfRouteStyles.textInput)}
                            defaultValue={editorSource?.name}
                            name="name"
                            placeholder="Uses the source title"
                            required={editor !== 'add'}
                            type="text"
                          />
                        </label>
                        <button
                          {...stylex.props(shelfRouteStyles.accountDisclosure)}
                          aria-expanded={showAccount}
                          type="button"
                          onClick={() => setShowAccount(current => !current)}
                        >
                          <span {...stylex.props(shelfRouteStyles.accountLabel)}>
                            <KeyRound size={15} strokeWidth={1.8} aria-hidden="true" />
                            Account
                          </span>
                          <span>{showAccount ? 'Remove sign-in' : 'Add sign-in'}</span>
                        </button>
                        <AnimatePresence initial={false}>
                          {showAccount
                            ? (
                                <motion.div
                                  {...stylex.props(shelfRouteStyles.accountFields)}
                                  animate={{ height: 'auto', opacity: 1 }}
                                  exit={{ height: 0, opacity: 0 }}
                                  initial={{ height: 0, opacity: 0 }}
                                  transition={shouldReduceMotion ? { duration: 0.12 } : menuSpring}
                                >
                                  <label {...stylex.props(shelfRouteStyles.field)}>
                                    <span>Username</span>
                                    <input {...stylex.props(shelfRouteStyles.textInput)} autoComplete="username" defaultValue={editorSource?.username ?? ''} name="username" required type="text" />
                                  </label>
                                  <label {...stylex.props(shelfRouteStyles.field)}>
                                    <span>
                                      Password
                                      {editorSource?.auth === 'basic' ? <small {...stylex.props(shelfRouteStyles.fieldOptional)}>Leave blank to keep</small> : null}
                                    </span>
                                    <input
                                      {...stylex.props(shelfRouteStyles.textInput)}
                                      autoComplete="current-password"
                                      name="password"
                                      required={editorSource?.auth !== 'basic'}
                                      type="password"
                                    />
                                  </label>
                                  <p {...stylex.props(shelfRouteStyles.privacyNote)}>The password is encrypted with this device’s secure storage and is never synchronized.</p>
                                </motion.div>
                              )
                            : null}
                        </AnimatePresence>
                        {error
                          ? (
                              <div {...stylex.props(shelfRouteStyles.formError)} role="alert">
                                <AlertCircle size={15} strokeWidth={1.9} aria-hidden="true" />
                                <span>{publicErrorMessage(error)}</span>
                              </div>
                            )
                          : null}
                        <footer {...stylex.props(shelfRouteStyles.sheetActions)}>
                          <button {...stylex.props(shelfRouteStyles.secondaryButton)} disabled={isPending} type="button" onClick={cancelEditor}>Cancel</button>
                          <button {...stylex.props(shelfRouteStyles.primaryButton)} disabled={isPending} type="submit">
                            {isPending ? <LoaderCircle {...stylex.props(shelfRouteStyles.spinner)} size={16} strokeWidth={1.9} aria-hidden="true" /> : editor === 'add' ? <Plus size={16} strokeWidth={1.9} aria-hidden="true" /> : <Check size={16} strokeWidth={1.9} aria-hidden="true" />}
                            {isPending ? 'Checking…' : editor === 'add' ? 'Add Source' : 'Save Changes'}
                          </button>
                        </footer>
                      </form>
                    )}
              </motion.section>
            </motion.div>
          )
        : null}
    </AnimatePresence>
  )
}

function RemoveSourceSheet({
  isPending,
  onCancel,
  onConfirm,
  source,
}: {
  isPending: boolean
  onCancel: () => void
  onConfirm: () => void
  source: ShelfSource | null
}) {
  const shouldReduceMotion = useReducedMotion()
  const cancelButtonRef = useRef<HTMLButtonElement>(null)
  const dialogRef = useRef<HTMLElement>(null)
  const sheetAnimate = shouldReduceMotion ? { opacity: 1 } : { filter: 'blur(0px)', opacity: 1, scale: 1, y: 0 }
  const sheetExit = shouldReduceMotion ? { opacity: 0 } : { filter: 'blur(4px)', opacity: 0, scale: 0.96, y: 14 }

  useDialogFocus({
    dialogRef,
    initialFocusRef: cancelButtonRef,
    isPending,
    onClose: onCancel,
    open: source !== null,
  })

  return (
    <AnimatePresence>
      {source
        ? (
            <motion.div {...stylex.props(shelfRouteStyles.sheetLayer)} animate={{ opacity: 1 }} exit={{ opacity: 0 }} initial={{ opacity: 0 }}>
              <button {...stylex.props(shelfRouteStyles.sheetScrim)} aria-label="Cancel removal" disabled={isPending} type="button" onClick={onCancel} />
              <motion.section
                ref={dialogRef}
                {...stylex.props(shelfRouteStyles.confirmSheet)}
                animate={sheetAnimate}
                aria-labelledby="remove-source-title"
                aria-modal="true"
                exit={sheetExit}
                initial={sheetExit}
                role="dialog"
                tabIndex={-1}
                transition={shouldReduceMotion ? { duration: 0.16 } : materialSpring}
              >
                <span {...stylex.props(shelfRouteStyles.destructiveGlyph)} aria-hidden="true"><Trash2 size={20} strokeWidth={1.7} /></span>
                <h2 id="remove-source-title" {...stylex.props(shelfRouteStyles.confirmTitle)}>{`Remove “${source.name}”?`}</h2>
                <p {...stylex.props(shelfRouteStyles.confirmText)}>Its saved book listings and covers will be removed from this device. No remote books are changed.</p>
                <div {...stylex.props(shelfRouteStyles.confirmActions)}>
                  <button ref={cancelButtonRef} {...stylex.props(shelfRouteStyles.secondaryButton)} disabled={isPending} type="button" onClick={onCancel}>Cancel</button>
                  <button {...stylex.props(shelfRouteStyles.destructiveButton)} disabled={isPending} type="button" onClick={onConfirm}>
                    {isPending ? 'Removing…' : 'Remove Source'}
                  </button>
                </div>
              </motion.section>
            </motion.div>
          )
        : null}
    </AnimatePresence>
  )
}

function ShelfRoute() {
  usePageTitlebar(shelfTitlebar)
  const navigate = shelfRouteApi.useNavigate()
  const routeSearch = shelfRouteApi.useSearch()
  const shouldReduceMotion = useReducedMotion()
  const queryClient = useQueryClient()
  const scrollElementRef = useRef<HTMLDivElement>(null)
  const sourceMenuRef = useRef<HTMLDivElement>(null)
  const sourceTriggerRef = useRef<HTMLButtonElement>(null)
  const [paginationByContext, setPaginationByContext] = useState<Record<string, readonly string[]>>({})
  const [sourceMenuOpen, setSourceMenuOpen] = useState(false)
  const [sourceManagerOpen, setSourceManagerOpen] = useState(false)
  const [sourceManagerInitialMode, setSourceManagerInitialMode] = useState<'add' | 'list'>('list')
  const [removingSource, setRemovingSource] = useState<ShelfSource | null>(null)
  const selectedSourceId = routeSearch.source ?? null
  const pageUrl = routeSearch.page ?? null
  const searchQuery = routeSearch.q ?? ''
  const deferredSearchQuery = useDeferredValue(searchQuery)

  const sourcesQuery = useQuery(shelfEffectQuery.queryOptions({
    queryFn: () => desktopEffect(() => window.desktop.listShelfSources()),
    queryKey: ['shelf-sources'],
    staleTime: Infinity,
  }))
  const sources = sourcesQuery.data ?? noSources
  const activeSourceId = selectedSourceId && sources.some(source => source.id === selectedSourceId)
    ? selectedSourceId
    : null
  const browseInput = useMemo<BrowseShelfInput>(() => ({
    ...(pageUrl ? { pageUrl } : {}),
    ...(activeSourceId ? { sourceId: activeSourceId } : {}),
  }), [activeSourceId, pageUrl])
  const browseEnabled = sourcesQuery.isSuccess && sources.length > 0
  const cachedViewQuery = useQuery(shelfEffectQuery.queryOptions({
    enabled: browseEnabled,
    queryFn: () => desktopEffect(() => window.desktop.getCachedShelfView(browseInput)),
    queryKey: ['shelf-view', 'cached', activeSourceId ?? allSourcesId, pageUrl],
    staleTime: Infinity,
  }))
  const refreshedViewQuery = useQuery(shelfEffectQuery.queryOptions({
    enabled: browseEnabled,
    queryFn: () => desktopEffect(() => window.desktop.refreshShelfView(browseInput)),
    queryKey: ['shelf-view', 'refresh', activeSourceId ?? allSourcesId, pageUrl],
    retry: false,
    staleTime: 60_000,
  }))
  const view: ShelfBrowseResult | undefined = refreshedViewQuery.data ?? cachedViewQuery.data
  const paginationContext = `${activeSourceId ?? allSourcesId}\0${pageUrl ?? ''}`
  const paginationUrls = activeSourceId ? paginationByContext[paginationContext] ?? [] : []
  const paginationQueries = useQueries({
    queries: paginationUrls.map(url => shelfEffectQuery.queryOptions({
      queryFn: () => desktopEffect(() => window.desktop.refreshShelfView({
        pageUrl: url,
        ...(activeSourceId ? { sourceId: activeSourceId } : {}),
      })),
      queryKey: ['shelf-view', 'pagination', activeSourceId, url],
      retry: false,
      staleTime: 60_000,
    })),
  })

  const addMutation = useMutation(shelfEffectQuery.mutationOptions({
    mutationFn: (input: AddShelfSourceInput) => desktopEffect(() => window.desktop.addShelfSource(input)),
    mutationKey: ['shelf-add-source'],
    onSuccess: async (source) => {
      await queryClient.invalidateQueries({ queryKey: ['shelf-sources'] })
      await queryClient.invalidateQueries({ queryKey: ['shelf-view'] })
      await navigate({ search: { source: source.id } })
    },
  }))
  const updateMutation = useMutation(shelfEffectQuery.mutationOptions({
    mutationFn: (input: UpdateShelfSourceInput) => desktopEffect(() => window.desktop.updateShelfSource(input)),
    mutationKey: ['shelf-update-source'],
    onSuccess: async () => {
      await navigate({
        search: previous => ({ ...previous, page: undefined }),
        replace: true,
      })
      await queryClient.invalidateQueries({ queryKey: ['shelf-sources'] })
      await queryClient.invalidateQueries({ queryKey: ['shelf-view'] })
    },
  }))
  const removeMutation = useMutation(shelfEffectQuery.mutationOptions({
    mutationFn: (sourceId: string) => desktopEffect(() => window.desktop.removeShelfSource(sourceId)),
    mutationKey: ['shelf-remove-source'],
    onSuccess: async (_, sourceId) => {
      if (selectedSourceId === sourceId) {
        await navigate({ search: {} })
      }
      setRemovingSource(null)
      await queryClient.invalidateQueries({ queryKey: ['shelf-sources'] })
      await queryClient.invalidateQueries({ queryKey: ['shelf-view'] })
    },
  }))

  useEffect(() => {
    if (!sourceMenuOpen)
      return
    const closeOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !sourceMenuRef.current?.contains(event.target))
        setSourceMenuOpen(false)
    }
    const closeWithEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape')
        setSourceMenuOpen(false)
    }
    window.addEventListener('pointerdown', closeOutside)
    window.addEventListener('keydown', closeWithEscape)
    return () => {
      window.removeEventListener('pointerdown', closeOutside)
      window.removeEventListener('keydown', closeWithEscape)
    }
  }, [sourceMenuOpen])

  const selectedSource = activeSourceId ? sources.find(source => source.id === activeSourceId) : undefined
  const selectedGroup = activeSourceId ? view?.groups.find(group => group.source.id === activeSourceId) : undefined
  const paginationGroups = paginationQueries.flatMap(query => query.data?.groups ?? [])
  const latestPaginationGroup = paginationGroups.at(-1)
  const paginationFetching = paginationQueries.some(query => query.isFetching)
  const nextPageUrl = paginationUrls.length === 0
    ? selectedGroup?.page?.nextUrl
    : latestPaginationGroup?.page?.nextUrl
  const displayedGroups = selectedGroup?.page
    ? [{
        ...selectedGroup,
        issue: latestPaginationGroup?.issue ?? selectedGroup.issue,
        page: {
          ...selectedGroup.page,
          nextUrl: nextPageUrl ?? null,
          publications: [
            ...selectedGroup.page.publications,
            ...paginationGroups.flatMap(group => group.page?.publications ?? []),
          ],
        },
      }]
    : view?.groups ?? []
  const matchingPublicationCount = displayedGroups.reduce((total, group) => {
    const normalizedQuery = deferredSearchQuery.trim().toLocaleLowerCase()
    if (normalizedQuery.length === 0)
      return total + (group.page?.publications.length ?? 0)
    return total + (group.page?.publications.filter(publication => (
      publication.title.toLocaleLowerCase().includes(normalizedQuery)
      || publication.authors.some(author => author.toLocaleLowerCase().includes(normalizedQuery))
    )).length ?? 0)
  }, 0) ?? 0
  const refreshStatusLabel = refreshedViewQuery.isFetching
    ? 'Refreshing…'
    : updatedLabel(view?.refreshedAt ?? null)
  const isAllSourcesOverview = activeSourceId === null
  const isCatalogOverview = activeSourceId !== null && Boolean(selectedGroup?.page?.navigation.length)
  const isFlatShelf = !isAllSourcesOverview && !isCatalogOverview

  const selectSource = (sourceId: string | null) => {
    startTransition(() => {
      void navigate({ search: sourceId ? { source: sourceId } : {} })
    })
    setSourceMenuOpen(false)
    requestAnimationFrame(() => sourceTriggerRef.current?.focus())
    scrollElementRef.current?.scrollTo({ behavior: 'auto', top: 0 })
  }

  const loadMore = () => {
    if (!nextPageUrl)
      throw new Error('The selected Shelf page has no next page')
    setPaginationByContext(current => ({
      ...current,
      [paginationContext]: [...(current[paginationContext] ?? []), nextPageUrl],
    }))
  }

  const browseSource = (sourceId: string) => {
    void navigate({
      search: previous => ({ ...previous, page: undefined, source: sourceId }),
    })
    scrollElementRef.current?.scrollTo({ behavior: 'auto', top: 0 })
  }

  const browseCategory = (sourceId: string, categoryUrl: string) => {
    void navigate({
      search: previous => ({ ...previous, page: categoryUrl, source: sourceId }),
    })
    scrollElementRef.current?.scrollTo({ behavior: 'auto', top: 0 })
  }

  return (
    <main {...stylex.props(shelfRouteStyles.page)} aria-label="Shelf">
      {sources.length > 0
        ? (
            <div {...stylex.props(shelfRouteStyles.toolbarWrap)}>
              <div {...stylex.props(shelfRouteStyles.toolbar)}>
                <div ref={sourceMenuRef} {...stylex.props(shelfRouteStyles.sourceSwitcher)}>
                  <button
                    ref={sourceTriggerRef}
                    {...stylex.props(shelfRouteStyles.sourceTrigger)}
                    aria-expanded={sourceMenuOpen}
                    aria-haspopup="menu"
                    type="button"
                    onClick={() => setSourceMenuOpen(open => !open)}
                  >
                    <span {...stylex.props(shelfRouteStyles.sourceTriggerIcon)} aria-hidden="true">
                      {selectedSource ? <Globe2 size={16} strokeWidth={1.8} /> : <LibraryBig size={16} strokeWidth={1.8} />}
                    </span>
                    <span {...stylex.props(shelfRouteStyles.sourceTriggerLabel)}>{selectedSource?.name ?? 'All Sources'}</span>
                    <ChevronDown size={14} strokeWidth={1.9} aria-hidden="true" />
                  </button>
                  <SourceMenu
                    open={sourceMenuOpen}
                    selectedSourceId={activeSourceId}
                    sources={sources}
                    onClose={() => {
                      setSourceMenuOpen(false)
                      requestAnimationFrame(() => sourceTriggerRef.current?.focus())
                    }}
                    onManage={() => {
                      setSourceMenuOpen(false)
                      addMutation.reset()
                      updateMutation.reset()
                      setSourceManagerInitialMode('list')
                      window.setTimeout(() => setSourceManagerOpen(true), shouldReduceMotion ? 0 : 180)
                    }}
                    onSelect={selectSource}
                  />
                </div>
                <div {...stylex.props(shelfRouteStyles.toolbarTrailing)}>
                  <label {...stylex.props(shelfRouteStyles.searchBox)}>
                    <Search size={15} strokeWidth={1.8} aria-hidden="true" />
                    <input
                      {...stylex.props(shelfRouteStyles.searchInput)}
                      aria-label="Search books"
                      placeholder="Search"
                      type="search"
                      value={searchQuery}
                      onChange={event => void navigate({
                        search: previous => ({ ...previous, q: event.target.value || undefined }),
                        replace: true,
                      })}
                    />
                    {searchQuery.length > 0
                      ? (
                          <button {...stylex.props(shelfRouteStyles.clearSearch)} aria-label="Clear search" type="button" onClick={() => void navigate({ search: previous => ({ ...previous, q: undefined }), replace: true })}>
                            <X size={13} strokeWidth={2} aria-hidden="true" />
                          </button>
                        )
                      : null}
                  </label>
                  <button
                    {...stylex.props(shelfRouteStyles.iconButton)}
                    aria-label={`Refresh Shelf. ${refreshStatusLabel}`}
                    disabled={!browseEnabled || refreshedViewQuery.isFetching}
                    title={refreshStatusLabel}
                    type="button"
                    onClick={() => void refreshedViewQuery.refetch()}
                  >
                    <RefreshCw {...stylex.props(refreshedViewQuery.isFetching && shelfRouteStyles.spinner)} size={16} strokeWidth={1.8} aria-hidden="true" />
                  </button>
                </div>
              </div>
            </div>
          )
        : null}

      <div
        ref={scrollElementRef}
        {...stylex.props(
          shelfRouteStyles.scrollViewport,
          sources.length > 0 ? shelfRouteStyles.scrollViewportWithToolbar : shelfRouteStyles.scrollViewportEmpty,
        )}
        aria-label="Book collection"
        role="region"
      >
        {sourcesQuery.isPending
          ? (
              <div {...stylex.props(shelfRouteStyles.loadingState)} role="status">
                <LoaderCircle {...stylex.props(shelfRouteStyles.spinner)} size={22} strokeWidth={1.6} aria-hidden="true" />
                <span>Opening Shelf…</span>
              </div>
            )
          : sourcesQuery.error
            ? (
                <div {...stylex.props(shelfRouteStyles.emptyState)} role="alert">
                  <AlertCircle {...stylex.props(shelfRouteStyles.emptyIcon)} aria-hidden="true" strokeWidth={1.5} />
                  <h1 {...stylex.props(shelfRouteStyles.emptyTitle)}>Couldn’t open Shelf</h1>
                  <p {...stylex.props(shelfRouteStyles.emptyText)}>{publicErrorMessage(sourcesQuery.error)}</p>
                  <button {...stylex.props(shelfRouteStyles.secondaryButton)} type="button" onClick={() => void sourcesQuery.refetch()}>Try Again</button>
                </div>
              )
            : sources.length === 0
              ? (
                  <div {...stylex.props(shelfRouteStyles.emptyState)}>
                    <LibraryBig {...stylex.props(shelfRouteStyles.emptyIcon)} size={30} strokeWidth={1.4} aria-hidden="true" />
                    <h1 {...stylex.props(shelfRouteStyles.emptyTitle)}>No Book Sources</h1>
                    <p {...stylex.props(shelfRouteStyles.emptyText)}>Add a source to browse books.</p>
                    <button
                      {...stylex.props(shelfRouteStyles.primaryButton)}
                      type="button"
                      onClick={() => {
                        addMutation.reset()
                        setSourceManagerInitialMode('add')
                        setSourceManagerOpen(true)
                      }}
                    >
                      <Plus size={16} strokeWidth={2} aria-hidden="true" />
                      Add Book Source
                    </button>
                  </div>
                )
              : view
                ? isFlatShelf && matchingPublicationCount === 0 && deferredSearchQuery.length > 0
                  ? (
                      <div {...stylex.props(shelfRouteStyles.emptyState)} role="status">
                        <Search {...stylex.props(shelfRouteStyles.emptyIcon)} aria-hidden="true" strokeWidth={1.5} />
                        <h1 {...stylex.props(shelfRouteStyles.emptyTitle)}>No matching books</h1>
                        <p {...stylex.props(shelfRouteStyles.emptyText)}>Try another title or author.</p>
                      </div>
                    )
                  : (
                      <>
                        {activeSourceId && displayedGroups[0]?.issue
                          ? (
                              <div {...stylex.props(shelfRouteStyles.selectedSourceIssue)} role="status">
                                <AlertCircle size={15} strokeWidth={1.9} aria-hidden="true" />
                                <span>{displayedGroups[0].issue.message}</span>
                              </div>
                            )
                          : null}
                        {isAllSourcesOverview
                          ? (
                              <AllSourcesOverview
                                groups={displayedGroups}
                                onBrowseSource={browseSource}
                                query={deferredSearchQuery}
                                scrollElementRef={scrollElementRef}
                              />
                            )
                          : isCatalogOverview && selectedGroup
                            ? (
                                <SourceOverview
                                  group={selectedGroup}
                                  onBrowseCategory={browseCategory}
                                  query={deferredSearchQuery}
                                  scrollElementRef={scrollElementRef}
                                />
                              )
                            : <VirtualShelf groups={displayedGroups} query={deferredSearchQuery} scrollElementRef={scrollElementRef} showGroupHeadings={false} />}
                        {isFlatShelf && activeSourceId && (paginationFetching || nextPageUrl)
                          ? (
                              <footer {...stylex.props(shelfRouteStyles.loadMoreFooter)}>
                                <button {...stylex.props(shelfRouteStyles.secondaryButton)} disabled={paginationFetching} type="button" onClick={loadMore}>
                                  {paginationFetching ? <LoaderCircle {...stylex.props(shelfRouteStyles.spinner)} size={16} strokeWidth={1.9} aria-hidden="true" /> : <ArrowDown size={16} strokeWidth={1.9} aria-hidden="true" />}
                                  {paginationFetching ? 'Loading…' : 'Load More Books'}
                                </button>
                              </footer>
                            )
                          : null}
                      </>
                    )
                : (
                    <div {...stylex.props(shelfRouteStyles.loadingState)} role="status">
                      <LoaderCircle {...stylex.props(shelfRouteStyles.spinner)} size={22} strokeWidth={1.6} aria-hidden="true" />
                      <span>Loading saved books…</span>
                    </div>
                  )}
      </div>

      {createPortal(
        <>
          {sourceManagerOpen
            ? (
                <SourceManagerSheet
                  addError={addMutation.error}
                  initialMode={sourceManagerInitialMode}
                  isPending={addMutation.isPending || updateMutation.isPending}
                  open
                  sources={sources}
                  updateError={updateMutation.error}
                  onAdd={async (input) => {
                    await addMutation.mutateAsync(input)
                  }}
                  onClose={() => {
                    if (!addMutation.isPending && !updateMutation.isPending)
                      setSourceManagerOpen(false)
                  }}
                  onRemove={(source) => {
                    setSourceManagerOpen(false)
                    setRemovingSource(source)
                  }}
                  onUpdate={async (input) => {
                    await updateMutation.mutateAsync(input)
                  }}
                />
              )
            : null}
          <RemoveSourceSheet
            isPending={removeMutation.isPending}
            source={removingSource}
            onCancel={() => {
              if (!removeMutation.isPending)
                setRemovingSource(null)
            }}
            onConfirm={() => {
              if (removingSource)
                removeMutation.mutate(removingSource.id)
            }}
          />
        </>,
        document.body,
      )}
    </main>
  )
}

export const Route = createFileRoute('/shelf')({
  component: ShelfRoute,
  validateSearch: validateShelfSearch,
})
