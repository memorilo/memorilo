import type { ShelfPage, ShelfReadingFormat } from './model'
import { hasReadingFormatSignature } from '@memorilo/reading-model'
import { Data, Effect } from 'effect'
import { parseShelfPage } from './opds-parser'
import { shelfReadingMediaType } from './reading'

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

export type ShelfRequestError = ShelfAuthenticationError | ShelfNetworkError | ShelfParseError | ShelfResponseError

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

export interface FetchShelfPublicationInput extends FetchShelfPageInput {
  format: ShelfReadingFormat
}

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

export interface FetchShelfPublicationResult {
  bytes: Uint8Array
  mimeType: string
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
  if (error instanceof ShelfAuthenticationError || error instanceof ShelfNetworkError || error instanceof ShelfParseError || error instanceof ShelfResponseError)
    return error
  return new ShelfNetworkError({ message: error instanceof Error ? error.message : `Request failed for ${url}` })
}

function responseError(response: Response, url: string): never {
  if (response.status === 401)
    throw new ShelfAuthenticationError({ message: 'This book source requires sign in.', url })
  throw new ShelfResponseError({ message: `Book source returned HTTP ${response.status}.`, status: response.status, url })
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
        page = parseShelfPage(body, response.headers.get('content-type') ?? '', response.url || url)
      }
      catch (error) {
        throw new ShelfParseError({ message: error instanceof Error ? error.message : 'The OPDS response could not be parsed.', url })
      }
      return { etag: response.headers.get('etag'), fetchedAt, lastModified: response.headers.get('last-modified'), page, status: 'updated' }
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
      if (!mimeType?.startsWith('image/'))
        throw new ShelfResponseError({ message: 'Book cover response is not an image.', status: response.status, url })
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

export function fetchShelfPublication(input: FetchShelfPublicationInput): Effect.Effect<FetchShelfPublicationResult, ShelfRequestError> {
  return Effect.tryPromise({
    try: async (signal) => {
      const url = assertRemoteUrl(input.url)
      const response = await fetch(url, {
        headers: requestHeaders(input, shelfReadingMediaType(input.format)),
        redirect: 'follow',
        signal,
      })
      if (!response.ok)
        responseError(response, url)
      const bytes = new Uint8Array(await response.arrayBuffer())
      if (!hasReadingFormatSignature(bytes, input.format))
        throw new ShelfResponseError({ message: `Downloaded ${input.format.toLocaleUpperCase()} content is not a valid publication.`, status: response.status, url })
      return { bytes, mimeType: shelfReadingMediaType(input.format) }
    },
    catch: error => knownRequestError(error, input.url),
  })
}
