import type {
  ShelfNavigationItem,
  ShelfPage,
  ShelfPublication,
  ShelfPublicationLink,
} from './model'
import { Data, Effect } from 'effect'
import { XMLParser } from 'fast-xml-parser'

// eslint-disable-next-line unicorn/throw-new-error
export class ShelfNetworkError extends Data.TaggedError('ShelfNetworkError')<{
  message: string
}> {}

// eslint-disable-next-line unicorn/throw-new-error
export class ShelfAuthenticationError extends Data.TaggedError('ShelfAuthenticationError')<{
  message: string
  url: string
}> {}

// eslint-disable-next-line unicorn/throw-new-error
export class ShelfResponseError extends Data.TaggedError('ShelfResponseError')<{
  message: string
  status: number
  url: string
}> {}

// eslint-disable-next-line unicorn/throw-new-error
export class ShelfParseError extends Data.TaggedError('ShelfParseError')<{
  message: string
  url: string
}> {}

export type ShelfRequestError
  = ShelfAuthenticationError
    | ShelfNetworkError
    | ShelfParseError
    | ShelfResponseError

export interface ShelfRequestCredentials {
  password: string
  username: string
}

export interface FetchShelfPageInput {
  credentials?: ShelfRequestCredentials
  etag?: string
  lastModified?: string
  url: string
}

export type FetchShelfPageResult = {
  fetchedAt: number
  status: 'not-modified'
} | {
  etag: string | null
  fetchedAt: number
  lastModified: string | null
  page: ShelfPage
  status: 'updated'
}

export interface FetchShelfAssetInput extends FetchShelfPageInput {}

export type FetchShelfAssetResult = {
  fetchedAt: number
  status: 'not-modified'
} | {
  bytes: Uint8Array
  etag: string | null
  fetchedAt: number
  lastModified: string | null
  mimeType: string
  status: 'updated'
}

type UnknownRecord = Record<string, unknown>

const xmlParser = new XMLParser({
  attributeNamePrefix: '@_',
  ignoreAttributes: false,
  removeNSPrefix: true,
  textNodeName: '#text',
})

const thumbnailRelations = new Set([
  'http://opds-spec.org/image/thumbnail',
  'https://opds-spec.org/image/thumbnail',
  'thumbnail',
])

const fullImageRelations = new Set([
  'http://opds-spec.org/image',
  'https://opds-spec.org/image',
  'image',
])

function asRecord(value: unknown): UnknownRecord | null {
  return value !== null && !Array.isArray(value) && typeof value === 'object'
    ? value as UnknownRecord
    : null
}

function asArray(value: unknown): readonly unknown[] {
  if (value === undefined || value === null)
    return []
  return Array.isArray(value) ? value : [value]
}

function optionalString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
}

function textValue(value: unknown): string | null {
  const direct = optionalString(value)
  if (direct !== null)
    return direct
  const record = asRecord(value)
  return record ? optionalString(record['#text']) : null
}

function requiredTitle(value: unknown, description: string): string {
  const title = textValue(value)
  if (title === null)
    throw new TypeError(`${description} is missing a title`)
  return title
}

function resolveHref(value: unknown, baseUrl: string): string | null {
  const href = optionalString(value)
  if (href === null)
    return null
  const url = new URL(href, baseUrl)
  if (url.protocol !== 'http:' && url.protocol !== 'https:')
    return null
  return url.href
}

function relationValues(value: unknown): readonly string[] {
  if (Array.isArray(value))
    return value.flatMap(item => optionalString(item) ? [String(item)] : [])
  const relation = optionalString(value)
  return relation === null ? [] : relation.split(/\s+/u)
}

function firstNamedLink(links: readonly ShelfPublicationLink[], relation: string): string | null {
  return links.find(link => relationValues(link.rel).includes(relation))?.href ?? null
}

function preferredImageLink(links: readonly ShelfPublicationLink[]): ShelfPublicationLink | null {
  return links.find(link => relationValues(link.rel).some(relation => thumbnailRelations.has(relation)))
    ?? links.find(link => relationValues(link.rel).some(relation => fullImageRelations.has(relation)))
    ?? null
}

function normalizeJsonLinks(value: unknown, baseUrl: string): readonly ShelfPublicationLink[] {
  return asArray(value).flatMap((candidate) => {
    const link = asRecord(candidate)
    if (link === null)
      return []
    const href = resolveHref(link.href, baseUrl)
    if (href === null)
      return []
    const relations = relationValues(link.rel)
    return [{
      href,
      rel: relations.join(' '),
      type: optionalString(link.type),
    }]
  })
}

function normalizeContributors(value: unknown): readonly string[] {
  return asArray(value).flatMap((candidate) => {
    const direct = optionalString(candidate)
    if (direct !== null)
      return [direct]
    const contributor = asRecord(candidate)
    const name = contributor ? optionalString(contributor.name) : null
    return name === null ? [] : [name]
  })
}

function publicationId(record: UnknownRecord, links: readonly ShelfPublicationLink[], title: string): string {
  const metadata = asRecord(record.metadata)
  return optionalString(metadata?.identifier)
    ?? firstNamedLink(links, 'self')
    ?? `${title}\0${links[0]?.href ?? ''}`
}

function normalizeJsonPublication(value: unknown, baseUrl: string, section: string | null): ShelfPublication {
  const publication = asRecord(value)
  if (publication === null)
    throw new TypeError('OPDS publication must be an object')
  const metadata = asRecord(publication.metadata)
  if (metadata === null)
    throw new TypeError('OPDS publication is missing metadata')
  const title = requiredTitle(metadata.title, 'OPDS publication')
  const links = normalizeJsonLinks(publication.links, baseUrl)
  const images = normalizeJsonLinks(publication.images, baseUrl)
  const cover = preferredImageLink([...images, ...links]) ?? images[0]
  return {
    authors: normalizeContributors(metadata.author ?? metadata.authors),
    coverUrl: cover?.href ?? null,
    id: publicationId(publication, links, title),
    links,
    section,
    subtitle: optionalString(metadata.subtitle),
    summary: textValue(metadata.description ?? metadata.summary),
    title,
  }
}

function normalizeJsonNavigation(value: unknown, baseUrl: string): ShelfNavigationItem {
  const item = asRecord(value)
  if (item === null)
    throw new TypeError('OPDS navigation item must be an object')
  const href = resolveHref(item.href, baseUrl)
  if (href === null)
    throw new TypeError('OPDS navigation item is missing an HTTP URL')
  return {
    href,
    subtitle: textValue(item.description),
    title: requiredTitle(item.title, 'OPDS navigation item'),
  }
}

function parseOpds2(value: unknown, requestUrl: string): ShelfPage {
  const feed = asRecord(value)
  if (feed === null)
    throw new TypeError('OPDS feed must be a JSON object')
  const metadata = asRecord(feed.metadata)
  const title = requiredTitle(metadata?.title, 'OPDS feed')
  const links = normalizeJsonLinks(feed.links, requestUrl)
  const groups = asArray(feed.groups)
  const publications = [
    ...asArray(feed.publications).map(item => normalizeJsonPublication(item, requestUrl, null)),
    ...groups.flatMap((candidate) => {
      const group = asRecord(candidate)
      if (group === null)
        return []
      const groupMetadata = asRecord(group.metadata)
      const section = textValue(groupMetadata?.title)
      return asArray(group.publications).map(item => normalizeJsonPublication(item, requestUrl, section))
    }),
  ]
  const navigation = [
    ...asArray(feed.navigation).map(item => normalizeJsonNavigation(item, requestUrl)),
    ...groups.flatMap((candidate) => {
      const group = asRecord(candidate)
      return group === null ? [] : asArray(group.navigation).map(item => normalizeJsonNavigation(item, requestUrl))
    }),
  ]
  return {
    nextUrl: firstNamedLink(links, 'next'),
    navigation,
    publications,
    selfUrl: firstNamedLink(links, 'self') ?? requestUrl,
    subtitle: textValue(metadata?.subtitle ?? metadata?.description),
    title,
  }
}

function normalizeAtomLinks(value: unknown, baseUrl: string): readonly ShelfPublicationLink[] {
  return asArray(value).flatMap((candidate) => {
    const link = asRecord(candidate)
    if (link === null)
      return []
    const href = resolveHref(link['@_href'], baseUrl)
    if (href === null)
      return []
    return [{
      href,
      rel: optionalString(link['@_rel']) ?? 'alternate',
      type: optionalString(link['@_type']),
    }]
  })
}

function parseAtom(value: unknown, requestUrl: string): ShelfPage {
  const document = asRecord(value)
  const feed = asRecord(document?.feed)
  if (feed === null)
    throw new TypeError('OPDS Atom document is missing a feed element')
  const feedLinks = normalizeAtomLinks(feed.link, requestUrl)
  const publications: ShelfPublication[] = []
  const navigation: ShelfNavigationItem[] = []

  for (const candidate of asArray(feed.entry)) {
    const entry = asRecord(candidate)
    if (entry === null)
      continue
    const title = requiredTitle(entry.title, 'OPDS Atom entry')
    const links = normalizeAtomLinks(entry.link, requestUrl)
    const acquisition = links.some(link => relationValues(link.rel).some(rel => rel.startsWith('http://opds-spec.org/acquisition')))
    if (!acquisition) {
      const href = firstNamedLink(links, 'subsection') ?? firstNamedLink(links, 'alternate')
      if (href !== null) {
        navigation.push({
          href,
          subtitle: textValue(entry.summary ?? entry.content),
          title,
        })
      }
      continue
    }
    const authors = asArray(entry.author).flatMap((author) => {
      const record = asRecord(author)
      const name = record ? textValue(record.name) : null
      return name === null ? [] : [name]
    })
    const cover = preferredImageLink(links)
    publications.push({
      authors,
      coverUrl: cover?.href ?? null,
      id: textValue(entry.id) ?? firstNamedLink(links, 'alternate') ?? `${title}\0${links[0]?.href ?? ''}`,
      links,
      section: null,
      subtitle: null,
      summary: textValue(entry.summary ?? entry.content),
      title,
    })
  }

  return {
    nextUrl: firstNamedLink(feedLinks, 'next'),
    navigation,
    publications,
    selfUrl: firstNamedLink(feedLinks, 'self') ?? requestUrl,
    subtitle: textValue(feed.subtitle),
    title: requiredTitle(feed.title, 'OPDS Atom feed'),
  }
}

function assertRemoteUrl(value: string): string {
  const url = new URL(value)
  if (url.protocol !== 'http:' && url.protocol !== 'https:')
    throw new TypeError('Shelf requests require an HTTP or HTTPS URL')
  return url.href
}

function encodeBasicCredentials(credentials: ShelfRequestCredentials): string {
  const bytes = new TextEncoder().encode(`${credentials.username}:${credentials.password}`)
  let binary = ''
  for (const byte of bytes)
    binary += String.fromCharCode(byte)
  return btoa(binary)
}

function requestHeaders(input: FetchShelfPageInput, accept: string): Headers {
  const headers = new Headers({ Accept: accept })
  if (input.credentials)
    headers.set('Authorization', `Basic ${encodeBasicCredentials(input.credentials)}`)
  if (input.etag)
    headers.set('If-None-Match', input.etag)
  if (input.lastModified)
    headers.set('If-Modified-Since', input.lastModified)
  return headers
}

function knownRequestError(error: unknown, url: string): ShelfRequestError {
  if (
    error instanceof ShelfAuthenticationError
    || error instanceof ShelfNetworkError
    || error instanceof ShelfParseError
    || error instanceof ShelfResponseError
  ) {
    return error
  }
  return new ShelfNetworkError({
    message: error instanceof Error ? error.message : `Request failed for ${url}`,
  })
}

function responseError(response: Response, url: string): never {
  if (response.status === 401) {
    throw new ShelfAuthenticationError({
      message: 'This book source requires sign in.',
      url,
    })
  }
  throw new ShelfResponseError({
    message: `Book source returned HTTP ${response.status}.`,
    status: response.status,
    url,
  })
}

export function fetchShelfPage(input: FetchShelfPageInput): Effect.Effect<FetchShelfPageResult, ShelfRequestError> {
  return Effect.tryPromise({
    try: async (signal) => {
      const url = assertRemoteUrl(input.url)
      const response = await fetch(url, {
        headers: requestHeaders(input, 'application/opds+json, application/atom+xml;q=0.9, application/xml;q=0.8, application/json;q=0.8'),
        redirect: 'follow',
        signal,
      })
      const fetchedAt = Date.now()
      if (response.status === 304)
        return { fetchedAt, status: 'not-modified' }
      if (!response.ok)
        responseError(response, url)
      const body = await response.text()
      let page: ShelfPage
      try {
        const contentType = response.headers.get('content-type') ?? ''
        page = contentType.includes('json') || body.trimStart().startsWith('{')
          ? parseOpds2(JSON.parse(body), response.url || url)
          : parseAtom(xmlParser.parse(body), response.url || url)
      }
      catch (error) {
        throw new ShelfParseError({
          message: error instanceof Error ? error.message : 'The OPDS response could not be parsed.',
          url,
        })
      }
      return {
        etag: response.headers.get('etag'),
        fetchedAt,
        lastModified: response.headers.get('last-modified'),
        page,
        status: 'updated',
      }
    },
    catch: error => knownRequestError(error, input.url),
  })
}

export function fetchShelfAsset(input: FetchShelfAssetInput): Effect.Effect<FetchShelfAssetResult, ShelfRequestError> {
  return Effect.tryPromise({
    try: async (signal) => {
      const url = assertRemoteUrl(input.url)
      const response = await fetch(url, {
        headers: requestHeaders(input, 'image/avif, image/webp, image/*;q=0.9'),
        redirect: 'follow',
        signal,
      })
      const fetchedAt = Date.now()
      if (response.status === 304)
        return { fetchedAt, status: 'not-modified' }
      if (!response.ok)
        responseError(response, url)
      const mimeType = response.headers.get('content-type')?.split(';', 1)[0]?.trim()
      if (!mimeType?.startsWith('image/')) {
        throw new ShelfResponseError({
          message: 'Book cover response is not an image.',
          status: response.status,
          url,
        })
      }
      return {
        bytes: new Uint8Array(await response.arrayBuffer()),
        etag: response.headers.get('etag'),
        fetchedAt,
        lastModified: response.headers.get('last-modified'),
        mimeType,
        status: 'updated',
      }
    },
    catch: error => knownRequestError(error, input.url),
  })
}
