import type {
  AnkiCard,
  AnkiCollectionSnapshot,
  AnkiConnectConfig,
  AnkiConnectError,
  AnkiDeck,
  AnkiDeckSnapshot,
  AnkiNote,
  AnkiPermission,
  AnkiRequest,
  AnkiReviewRating,
} from './model'
import { Effect } from 'effect'
import {
  AnkiConnectNetworkError,
  AnkiConnectProtocolError,
  AnkiConnectResponseError,
} from './model'

const apiVersion = 6

type UnknownRecord = Record<string, unknown>

function record(value: unknown, description: string): UnknownRecord {
  if (value === null || typeof value !== 'object' || Array.isArray(value))
    throw new AnkiConnectProtocolError(`${description} must be an object`)
  return value as UnknownRecord
}

function array(value: unknown, description: string): readonly unknown[] {
  if (!Array.isArray(value))
    throw new AnkiConnectProtocolError(`${description} must be an array`)
  return value
}

function string(value: unknown, description: string): string {
  if (typeof value !== 'string')
    throw new AnkiConnectProtocolError(`${description} must be a string`)
  return value
}

function number(value: unknown, description: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value))
    throw new AnkiConnectProtocolError(`${description} must be a finite number`)
  return value
}

function optionalBoolean(value: unknown, description: string): boolean | undefined {
  if (value === undefined)
    return undefined
  if (typeof value !== 'boolean')
    throw new AnkiConnectProtocolError(`${description} must be a boolean`)
  return value
}

function parseEffect<A>(description: string, evaluate: () => A): Effect.Effect<A, AnkiConnectProtocolError> {
  return Effect.try({
    try: evaluate,
    catch: error => error instanceof AnkiConnectProtocolError
      ? error
      : new AnkiConnectProtocolError(`Failed to parse ${description}`, { cause: error }),
  })
}

function normalizeEndpoint(endpoint: string | undefined): string {
  const value = endpoint ?? 'http://127.0.0.1:8765'
  const url = new URL(value)
  if (url.protocol !== 'http:' && url.protocol !== 'https:')
    throw new TypeError(`AnkiConnect endpoint must use HTTP or HTTPS: ${value}`)
  return url.href.replace(/\/$/u, '')
}

function parseResponse<T>(action: string, value: unknown): T {
  const response = record(value, `AnkiConnect ${action} response`)
  if (!('result' in response) || !('error' in response))
    throw new AnkiConnectProtocolError(`AnkiConnect ${action} response must contain result and error`)
  if (response.error !== null)
    throw new AnkiConnectResponseError(action, string(response.error, `AnkiConnect ${action} error`))
  return response.result as T
}

function requestBody(request: AnkiRequest, apiKey: string | undefined): Readonly<Record<string, unknown>> {
  return {
    action: request.action,
    ...(request.params === undefined ? {} : { params: request.params }),
    ...(apiKey === undefined ? {} : { key: apiKey }),
    version: request.version ?? apiVersion,
  }
}

function fetchRequest<T>(config: AnkiConnectConfig, request: AnkiRequest): Effect.Effect<T, AnkiConnectError> {
  return Effect.tryPromise({
    try: async (signal) => {
      const endpoint = normalizeEndpoint(config.endpoint)
      let response: Response
      try {
        response = await fetch(endpoint, {
          body: JSON.stringify(requestBody(request, config.apiKey)),
          headers: { 'content-type': 'application/json' },
          method: 'POST',
          signal,
        })
      }
      catch (error) {
        throw new AnkiConnectNetworkError(error instanceof Error ? error.message : `Failed to connect to ${endpoint}`, { cause: error })
      }
      if (!response.ok)
        throw new AnkiConnectNetworkError(`AnkiConnect returned HTTP ${response.status}`)
      let body: unknown
      try {
        body = await response.json()
      }
      catch (error) {
        throw new AnkiConnectProtocolError('AnkiConnect returned invalid JSON', { cause: error })
      }
      return parseResponse<T>(request.action, body)
    },
    catch: error => error instanceof AnkiConnectNetworkError || error instanceof AnkiConnectProtocolError || error instanceof AnkiConnectResponseError
      ? error
      : new AnkiConnectNetworkError(error instanceof Error ? error.message : 'AnkiConnect request failed', { cause: error }),
  })
}

function parseField(value: unknown, description: string): { order: number, value: string } {
  const item = record(value, description)
  return { order: number(item.order, `${description} order`), value: string(item.value, `${description} value`) }
}

function parseFields(value: unknown, description: string): Readonly<Record<string, { order: number, value: string }>> {
  const item = record(value, description)
  return Object.fromEntries(Object.entries(item).map(([name, field]) => [name, parseField(field, `${description}.${name}`)]))
}

function parseCard(value: unknown): AnkiCard {
  const item = record(value, 'Anki card')
  return {
    answer: string(item.answer, 'Anki card answer'),
    cardId: number(item.cardId, 'Anki card id'),
    css: string(item.css, 'Anki card css'),
    deckName: string(item.deckName, 'Anki card deck name'),
    due: number(item.due, 'Anki card due'),
    fieldOrder: number(item.fieldOrder, 'Anki card field order'),
    fields: parseFields(item.fields, 'Anki card fields'),
    interval: number(item.interval, 'Anki card interval'),
    lapses: number(item.lapses, 'Anki card lapses'),
    left: number(item.left, 'Anki card left'),
    modelName: string(item.modelName, 'Anki card model name'),
    mod: number(item.mod, 'Anki card modification time'),
    nextReviews: array(item.nextReviews, 'Anki card next reviews').map((review, index) => string(review, `Anki card next review ${index}`)),
    note: number(item.note, 'Anki card note id'),
    ord: number(item.ord, 'Anki card ordinal'),
    queue: number(item.queue, 'Anki card queue'),
    question: string(item.question, 'Anki card question'),
    reps: number(item.reps, 'Anki card repetitions'),
    type: number(item.type, 'Anki card type'),
  }
}

function parseNote(value: unknown): AnkiNote {
  const item = record(value, 'Anki note')
  return {
    cards: array(item.cards, 'Anki note cards').map((card, index) => number(card, `Anki note card ${index}`)),
    fields: parseFields(item.fields, 'Anki note fields'),
    mod: number(item.mod, 'Anki note modification time'),
    modelName: string(item.modelName, 'Anki note model name'),
    noteId: number(item.noteId, 'Anki note id'),
    profile: string(item.profile, 'Anki note profile'),
    tags: array(item.tags, 'Anki note tags').map((tag, index) => string(tag, `Anki note tag ${index}`)),
  }
}

function deckQuery(deckName: string): string {
  if (deckName.trim().length === 0)
    throw new TypeError('Anki deck name cannot be empty')
  return `deck:"${deckName.replaceAll('"', '\\"')}"`
}

function exactDeckQuery(deckName: string): string {
  return `${deckQuery(deckName)} -${deckQuery(`${deckName}::*`)}`
}

export interface AnkiConnectClient {
  readonly answerCards: (answers: readonly { cardId: number, ease: AnkiReviewRating }[]) => Effect.Effect<readonly boolean[], AnkiConnectError>
  readonly collectionSnapshot: () => Effect.Effect<AnkiCollectionSnapshot, AnkiConnectError>
  readonly deckSnapshot: (deck: AnkiDeck) => Effect.Effect<AnkiDeckSnapshot, AnkiConnectError>
  readonly decks: () => Effect.Effect<readonly AnkiDeck[], AnkiConnectError>
  readonly hasApiKey: boolean
  readonly permission: () => Effect.Effect<AnkiPermission, AnkiConnectError>
  readonly request: <T>(request: AnkiRequest) => Effect.Effect<T, AnkiConnectError>
  readonly retrieveMediaFile: (filename: string) => Effect.Effect<string | null, AnkiConnectError>
}

export function createAnkiConnectClient(config: AnkiConnectConfig = {}): AnkiConnectClient {
  if (config.apiKey !== undefined && config.apiKey.length === 0)
    throw new TypeError('AnkiConnect API key cannot be empty')
  const normalizedConfig = { ...config, endpoint: normalizeEndpoint(config.endpoint) }
  const request = <T>(input: AnkiRequest): Effect.Effect<T, AnkiConnectError> => fetchRequest<T>(normalizedConfig, input)

  const decks = (): Effect.Effect<readonly AnkiDeck[], AnkiConnectError> => (
    request<unknown>({ action: 'deckNamesAndIds' }).pipe(
      Effect.flatMap(result => parseEffect('Anki deck names and ids', () => {
        const item = record(result, 'Anki deck names and ids')
        return Object.entries(item).map(([name, id]) => ({ id: number(id, `Anki deck ${name} id`), name }))
      })),
    )
  )

  const permission = (): Effect.Effect<AnkiPermission, AnkiConnectError> => (
    request<unknown>({ action: 'requestPermission', params: { allowed: true, origin: '' } }).pipe(
      Effect.flatMap(result => parseEffect('Anki permission', () => {
        const item = record(result, 'Anki permission')
        const permissionValue = string(item.permission, 'Anki permission status')
        if (permissionValue !== 'granted' && permissionValue !== 'denied')
          throw new AnkiConnectProtocolError(`Unsupported Anki permission status: ${permissionValue}`)
        const reportedApiKey = item.requireApiKey ?? item.requireApikey
        return {
          permission: permissionValue,
          requireApiKey: optionalBoolean(reportedApiKey, 'Anki permission API key requirement'),
          version: item.version === undefined ? undefined : number(item.version, 'Anki permission API version'),
        }
      })),
    )
  )

  const deckSnapshot = (deck: AnkiDeck): Effect.Effect<AnkiDeckSnapshot, AnkiConnectError> => (
    Effect.gen(function* () {
      const query = exactDeckQuery(deck.name)
      const cardIds = yield* request<readonly unknown[]>({ action: 'findCards', params: { query } }).pipe(
        Effect.flatMap(result => parseEffect('Anki card ids', () => result.map((card, index) => number(card, `Anki card id ${index}`)))),
      )
      const [cards, noteIds] = yield* Effect.all([
        request<readonly unknown[]>({ action: 'cardsInfo', params: { cards: cardIds } }).pipe(
          Effect.flatMap(result => parseEffect('Anki cards', () => result.map(parseCard))),
        ),
        request<readonly unknown[]>({ action: 'cardsToNotes', params: { cards: cardIds } }).pipe(
          Effect.flatMap(result => parseEffect('Anki note ids', () => result.map((note, index) => number(note, `Anki note id ${index}`)))),
        ),
      ], { concurrency: 'unbounded' })
      const notes = yield* request<readonly unknown[]>({ action: 'notesInfo', params: { notes: noteIds } }).pipe(
        Effect.flatMap(result => parseEffect('Anki notes', () => result.map(parseNote))),
      )
      const queue = yield* request<readonly unknown[]>({ action: 'findCards', params: { query: `${query} is:due` } }).pipe(
        Effect.flatMap(result => parseEffect('Anki due card ids', () => result.map((card, index) => number(card, `Anki due card id ${index}`)))),
        Effect.flatMap(queueIds => request<readonly unknown[]>({ action: 'cardsInfo', params: { cards: queueIds } })),
        Effect.flatMap(result => parseEffect('Anki due cards', () => result.map(parseCard))),
      )
      return { cards, deck, notes, queue }
    })
  )

  const answerCards = (answers: readonly { cardId: number, ease: AnkiReviewRating }[]): Effect.Effect<readonly boolean[], AnkiConnectError> => (
    request<readonly unknown[]>({ action: 'answerCards', params: { answers } }).pipe(
      Effect.flatMap(result => parseEffect('Anki answer results', () => result.map((value, index) => {
        if (typeof value !== 'boolean')
          throw new AnkiConnectProtocolError(`Anki answer result ${index} must be boolean`)
        return value
      }))),
    )
  )

  const retrieveMediaFile = (filename: string): Effect.Effect<string | null, AnkiConnectError> => {
    if (filename.trim().length === 0)
      throw new TypeError('Anki media filename cannot be empty')
    return request<unknown>({ action: 'retrieveMediaFile', params: { filename } }).pipe(
      Effect.flatMap(result => parseEffect(`Anki media file ${filename}`, () => {
        if (result === false)
          return null
        return string(result, `Anki media file ${filename}`)
      })),
    )
  }

  const collectionSnapshot = (): Effect.Effect<AnkiCollectionSnapshot, AnkiConnectError> => (
    Effect.gen(function* () {
      const allDecks = yield* decks()
      const snapshots = yield* Effect.forEach(allDecks, deckSnapshot, { concurrency: 1 })
      return { decks: snapshots }
    })
  )

  return {
    answerCards,
    collectionSnapshot,
    deckSnapshot,
    decks,
    hasApiKey: normalizedConfig.apiKey !== undefined,
    permission,
    request,
    retrieveMediaFile,
  }
}
