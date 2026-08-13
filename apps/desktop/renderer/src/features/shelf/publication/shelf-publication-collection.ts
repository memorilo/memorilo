import type {
  ShelfBrowseGroup,
  ShelfBrowseIssue,
  ShelfBrowseResult,
  ShelfPublication,
} from '@memorilo/shelf'
import { matchesShelfPublication } from '@memorilo/shelf'

export function formatShelfPublicationAuthors(publication: ShelfPublication, unknownAuthor = 'Unknown author'): string {
  return publication.authors.length === 0 ? unknownAuthor : publication.authors.join(', ')
}

export function shelfBrowseIssueTranslation(issue: ShelfBrowseIssue): {
  key: 'shelfSourceAuthenticationRequired' | 'shelfSourceInvalidCatalog' | 'shelfSourceRequestFailed' | 'shelfSourceUnavailable'
  options?: { status: number }
} {
  switch (issue.kind) {
    case 'authentication':
      return { key: 'shelfSourceAuthenticationRequired' }
    case 'network':
      return { key: 'shelfSourceUnavailable' }
    case 'parse':
      return { key: 'shelfSourceInvalidCatalog' }
    case 'response':
      return { key: 'shelfSourceRequestFailed', options: { status: issue.status } }
  }
}

export function shelfFormatName(type: string | null): string {
  if (type === 'application/epub+zip')
    return 'EPUB'
  if (type === 'application/pdf')
    return 'PDF'
  if (type === 'text/plain')
    return 'TXT'
  if (type === 'application/vnd.comicbook+zip' || type === 'application/x-cbz')
    return 'CBZ'
  if (type === 'application/vnd.comicbook-rar'
    || type === 'application/x-cbr'
    || type === 'application/vnd.rar'
    || type === 'application/x-rar-compressed') {
    return 'CBR'
  }
  if (type === null)
    return 'Book'
  return type.split('/').at(-1)?.toLocaleUpperCase() ?? type.toLocaleUpperCase()
}

export function matchingShelfPublications(
  publications: readonly ShelfPublication[],
  searchQuery: string,
): readonly ShelfPublication[] {
  const normalizedQuery = searchQuery.trim().toLocaleLowerCase()
  if (normalizedQuery.length === 0)
    return publications
  return publications.filter(publication => matchesShelfPublication(publication, normalizedQuery))
}

function groupFromResult(result: ShelfBrowseResult, sourceId: string): ShelfBrowseGroup {
  const group = result.groups.find(candidate => candidate.source.id === sourceId)
  if (!group)
    throw new Error(`Shelf result is missing source ${sourceId}`)
  return group
}

export function nextShelfCatalogUrl(
  results: readonly ShelfBrowseResult[],
  pageUrls: readonly string[],
  sourceId: string,
  includeNavigation: boolean,
): string | undefined {
  const visited = new Set(pageUrls)
  const pages = results
    .map(result => groupFromResult(result, sourceId).page)
    .filter(page => page !== null)

  for (const page of [...pages].reverse()) {
    const navigationUrls = includeNavigation ? page.navigation.map(item => item.href) : []
    const paginationUrls = page.nextUrl === null ? [] : [page.nextUrl]
    const candidates = page.publications.length === 0
      ? [...navigationUrls, ...paginationUrls]
      : [...paginationUrls, ...navigationUrls]
    const nextUrl = candidates.find(url => !visited.has(url))
    if (nextUrl)
      return nextUrl
  }
  return undefined
}

export function uniqueShelfPublications(
  results: readonly ShelfBrowseResult[],
  sourceId: string,
): readonly ShelfPublication[] {
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

export function latestShelfBrowseIssue(
  results: readonly ShelfBrowseResult[],
  sourceId: string,
): ShelfBrowseGroup['issue'] {
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
