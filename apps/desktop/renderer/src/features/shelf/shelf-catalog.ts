import type { BrowseShelfInput, ShelfBrowseGroup, ShelfBrowseIssue, ShelfSource } from '@memorilo/shelf'
import type { ShelfSearch } from './shelf-page'
import { useQueries, useQuery } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { matchingShelfPublications } from './publication/shelf-publication-collection'
import { desktopEffect, shelfEffectQuery } from './shelf-query'

const allSourcesId = 'all'
const noSources: readonly ShelfSource[] = []

export type ShelfCatalogContent
  = | { groups: readonly ShelfBrowseGroup[], kind: 'all-sources' }
    | { group: ShelfBrowseGroup, kind: 'source-navigation' }
    | {
      groups: readonly ShelfBrowseGroup[]
      issue: ShelfBrowseIssue | null
      kind: 'books'
      matchingPublicationCount: number
    }

export type ShelfSourcesState = 'available' | 'empty' | 'failed' | 'opening'

export function useShelfCatalog(routeSearch: ShelfSearch, query: string) {
  const [paginationByContext, setPaginationByContext] = useState<Record<string, readonly string[]>>({})
  const selectedSourceId = routeSearch.source ?? null
  const pageUrl = routeSearch.page ?? null
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
  const view = refreshedViewQuery.data ?? cachedViewQuery.data
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

  const selectedSource = activeSourceId
    ? sources.find(source => source.id === activeSourceId)
    : undefined
  const selectedGroup = activeSourceId
    ? view?.groups.find(group => group.source.id === activeSourceId)
    : undefined
  const paginationGroups = paginationQueries.flatMap(result => result.data?.groups ?? [])
  const latestPaginationGroup = paginationGroups.at(-1)
  const paginationFetching = paginationQueries.some(result => result.isFetching)
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

  let content: ShelfCatalogContent | null = null
  if (view) {
    if (activeSourceId === null) {
      content = { groups: displayedGroups, kind: 'all-sources' }
    }
    else if (selectedGroup?.page?.navigation.length) {
      content = { group: selectedGroup, kind: 'source-navigation' }
    }
    else {
      content = {
        groups: displayedGroups,
        issue: displayedGroups[0]?.issue ?? null,
        kind: 'books',
        matchingPublicationCount: displayedGroups.reduce(
          (total, group) => total + matchingShelfPublications(group.page?.publications ?? [], query).length,
          0,
        ),
      }
    }
  }

  const sourcesState: ShelfSourcesState = sourcesQuery.isPending
    ? 'opening'
    : sourcesQuery.error
      ? 'failed'
      : sources.length === 0
        ? 'empty'
        : 'available'

  return {
    activeSourceId,
    canLoadMore: content?.kind === 'books' && Boolean(activeSourceId && (paginationFetching || nextPageUrl)),
    content,
    loadMore: () => {
      if (!nextPageUrl)
        throw new Error('The selected Shelf page has no next page')
      setPaginationByContext(current => ({
        ...current,
        [paginationContext]: [...(current[paginationContext] ?? []), nextPageUrl],
      }))
    },
    paginationFetching,
    refresh: () => void refreshedViewQuery.refetch(),
    refreshDisabled: !browseEnabled || refreshedViewQuery.isFetching,
    refreshedAt: view?.refreshedAt ?? null,
    refreshing: refreshedViewQuery.isFetching,
    retrySources: () => void sourcesQuery.refetch(),
    selectedSource,
    sources,
    sourcesError: sourcesQuery.error,
    sourcesState,
  }
}

export type ShelfCatalog = ReturnType<typeof useShelfCatalog>
