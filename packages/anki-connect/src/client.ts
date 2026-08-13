import type {
  AnkiCard,
  AnkiCollectionSnapshot,
  AnkiConnectConfig,
  AnkiConnectError,
  AnkiConnectFetch,
  AnkiDeck,
  AnkiDeckSnapshot,
  AnkiNote,
  AnkiPermission,
  AnkiRequest,
  AnkiReviewAnswerInput,
  AnkiReviewCardInput,
  AnkiReviewerCard,
} from './model'
import { Effect, Layer, Schema, Semaphore, ServiceMap } from 'effect'
import {
  AnkiCardSchema,
  AnkiConnectConfigurationError,
  AnkiConnectGuiStateError,
  AnkiConnectHttpError,
  AnkiConnectInputError,
  AnkiConnectNetworkError,
  AnkiConnectProtocolError,
  AnkiConnectResponseError,
  AnkiNoteSchema,
  AnkiRequestSchema,
  AnkiReviewAnswerInputSchema,
  AnkiReviewCardInputSchema,
  AnkiReviewRatingSchema,
} from './model'

const apiVersion = 6
const defaultEndpoint = 'http://127.0.0.1:8765'
const parseOptions = { errors: 'all' } as const
const PositiveIntegerSchema = Schema.Int.check(Schema.isGreaterThan(0))
const CardIdsSchema = Schema.Array(PositiveIntegerSchema)
const CardsSchema = Schema.Array(AnkiCardSchema)
const NotesSchema = Schema.Array(AnkiNoteSchema)
const GuiResultSchema = Schema.Boolean
const MediaResultSchema = Schema.Union([Schema.String, Schema.Literal(false)])
const DeckNamesAndIdsSchema = Schema.Record(Schema.NonEmptyString, PositiveIntegerSchema)
const PermissionResultSchema = Schema.Struct({
  permission: Schema.Literals(['denied', 'granted']),
  requireApiKey: Schema.optionalKey(Schema.Boolean),
  requireApikey: Schema.optionalKey(Schema.Boolean),
  version: Schema.optionalKey(PositiveIntegerSchema),
})
const ReviewerCardResultSchema = Schema.Struct({
  answer: Schema.String,
  buttons: Schema.Array(AnkiReviewRatingSchema),
  cardId: PositiveIntegerSchema,
  css: Schema.String,
  deckName: Schema.NonEmptyString,
  fieldOrder: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  fields: Schema.Record(Schema.String, Schema.Struct({
    order: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
    value: Schema.String,
  })),
  modelName: Schema.NonEmptyString,
  nextReviews: Schema.Array(Schema.String),
  question: Schema.String,
  template: Schema.NonEmptyString,
})
let nextClientId = 0
const ResponseEnvelopeSchema = Schema.Struct({
  error: Schema.NullOr(Schema.String),
  result: Schema.Unknown,
})

interface NormalizedConfig {
  readonly apiKey?: string
  readonly endpoint: string
  readonly fetch: AnkiConnectFetch
}

function configuration(config: unknown): Effect.Effect<NormalizedConfig, AnkiConnectConfigurationError> {
  return Effect.try({
    try: () => {
      if (config === null || typeof config !== 'object' || Array.isArray(config))
        throw new TypeError('AnkiConnect configuration must be an object')
      const input = config as AnkiConnectConfig
      const apiKey = input.apiKey
      const endpointInput = input.endpoint
      const fetchInput = input.fetch
      if (apiKey !== undefined && typeof apiKey !== 'string')
        throw new TypeError('AnkiConnect API key must be a string')
      if (apiKey !== undefined && apiKey.length === 0)
        throw new TypeError('AnkiConnect API key cannot be empty')
      if (endpointInput !== undefined && typeof endpointInput !== 'string')
        throw new TypeError('AnkiConnect endpoint must be a string')
      if (fetchInput !== undefined && typeof fetchInput !== 'function')
        throw new TypeError('AnkiConnect fetch adapter must be a function')
      const endpoint = new URL(endpointInput ?? defaultEndpoint)
      if (endpoint.protocol !== 'http:' && endpoint.protocol !== 'https:')
        throw new TypeError(`AnkiConnect endpoint must use HTTP or HTTPS: ${endpoint.href}`)
      const fetchImplementation = fetchInput ?? globalThis.fetch
      if (typeof fetchImplementation !== 'function')
        throw new TypeError('AnkiConnect requires a fetch implementation')
      return {
        ...(apiKey === undefined ? {} : { apiKey }),
        endpoint: endpoint.href.replace(/\/+$/u, ''),
        fetch: fetchImplementation,
      }
    },
    catch: cause => new AnkiConnectConfigurationError(
      cause instanceof Error ? cause.message : 'Invalid AnkiConnect configuration',
      { cause },
    ),
  })
}

function decodeProtocol<S extends Schema.Top & { readonly DecodingServices: never }>(
  action: string,
  description: string,
  schema: S,
  value: unknown,
): Effect.Effect<S['Type'], AnkiConnectProtocolError> {
  return Schema.decodeUnknownEffect(schema)(value, parseOptions).pipe(
    Effect.mapError(error => new AnkiConnectProtocolError(
      `Invalid ${description}: ${error.message}`,
      { action, cause: error },
    )),
  )
}

function decodeInput<S extends Schema.Top & { readonly DecodingServices: never }>(
  action: string | undefined,
  description: string,
  schema: S,
  value: unknown,
): Effect.Effect<S['Type'], AnkiConnectInputError> {
  return Schema.decodeUnknownEffect(schema)(value, parseOptions).pipe(
    Effect.mapError(error => new AnkiConnectInputError(
      `Invalid ${description}: ${error.message}`,
      { action, cause: error },
    )),
  )
}

function encodeRequestBody(request: AnkiRequest, apiKey: string | undefined): Effect.Effect<string, AnkiConnectInputError> {
  return Effect.try({
    try: () => JSON.stringify({
      action: request.action,
      ...(request.params === undefined ? {} : { params: request.params }),
      ...(apiKey === undefined ? {} : { key: apiKey }),
      version: request.version ?? apiVersion,
    }),
    catch: cause => new AnkiConnectInputError(
      `AnkiConnect ${request.action} parameters are not JSON serializable`,
      { action: request.action, cause },
    ),
  })
}

function uniqueValues(values: readonly number[], action: string, description: string): Effect.Effect<readonly number[], AnkiConnectProtocolError> {
  const unique = new Set(values)
  if (unique.size !== values.length) {
    return Effect.fail(new AnkiConnectProtocolError(
      `${description} contains duplicate identifiers`,
      { action },
    ))
  }
  return Effect.succeed(values)
}

function orderResultsById<A>(
  requestedIds: readonly number[],
  results: readonly A[],
  id: (result: A) => number,
  action: string,
  description: string,
): Effect.Effect<readonly A[], AnkiConnectProtocolError> {
  return Effect.gen(function* () {
    yield* uniqueValues(requestedIds, action, `Requested ${description}`)
    const byId = new Map<number, A>()
    for (const result of results) {
      const resultId = id(result)
      if (byId.has(resultId)) {
        return yield* new AnkiConnectProtocolError(
          `AnkiConnect ${action} returned duplicate ${description} ${resultId}`,
          { action },
        )
      }
      byId.set(resultId, result)
    }
    if (byId.size !== requestedIds.length) {
      return yield* new AnkiConnectProtocolError(
        `AnkiConnect ${action} returned ${byId.size} ${description} records for ${requestedIds.length} requested identifiers`,
        { action },
      )
    }
    const ordered: A[] = []
    for (const requestedId of requestedIds) {
      const result = byId.get(requestedId)
      if (!result) {
        return yield* new AnkiConnectProtocolError(
          `AnkiConnect ${action} omitted ${description} ${requestedId}`,
          { action },
        )
      }
      ordered.push(result)
    }
    return ordered
  })
}

function deckQuery(deckName: string): Effect.Effect<string, AnkiConnectInputError> {
  if (deckName.trim().length === 0)
    return Effect.fail(new AnkiConnectInputError('Anki deck name cannot be empty', { action: 'findCards' }))
  return Effect.succeed(`deck:"${deckName.replaceAll('"', '\\"')}"`)
}

function exactDeckQuery(deckName: string): Effect.Effect<string, AnkiConnectInputError> {
  return Effect.gen(function* () {
    const deck = yield* deckQuery(deckName)
    const children = yield* deckQuery(`${deckName}::*`)
    return `${deck} -${children}`
  })
}

export interface AnkiConnectClient {
  readonly answerReviewCard: (input: AnkiReviewAnswerInput) => Effect.Effect<AnkiReviewerCard | null, AnkiConnectError>
  readonly cacheKey: string
  readonly collectionSnapshot: () => Effect.Effect<AnkiCollectionSnapshot, AnkiConnectError>
  readonly deckSnapshot: (deck: AnkiDeck) => Effect.Effect<AnkiDeckSnapshot, AnkiConnectError>
  readonly decks: () => Effect.Effect<readonly AnkiDeck[], AnkiConnectError>
  readonly hasApiKey: boolean
  readonly permission: () => Effect.Effect<AnkiPermission, AnkiConnectError>
  readonly endReview: () => Effect.Effect<void, AnkiConnectError>
  readonly playReviewAudio: (input: AnkiReviewCardInput) => Effect.Effect<void, AnkiConnectError>
  readonly currentReviewCard: () => Effect.Effect<AnkiReviewerCard | null, AnkiConnectError>
  readonly reviewActive: () => Effect.Effect<boolean, AnkiConnectError>
  readonly retrieveMediaFile: (filename: string) => Effect.Effect<string | null, AnkiConnectError>
  readonly showReviewAnswer: (input: AnkiReviewCardInput) => Effect.Effect<AnkiReviewerCard, AnkiConnectError>
  readonly showReviewQuestion: (input: AnkiReviewCardInput) => Effect.Effect<AnkiReviewerCard, AnkiConnectError>
  readonly startReview: (deck: AnkiDeck) => Effect.Effect<AnkiReviewerCard | null, AnkiConnectError>
  readonly startReviewCardTimer: (input: AnkiReviewCardInput) => Effect.Effect<void, AnkiConnectError>
}

export class AnkiConnect extends ServiceMap.Service<AnkiConnect, AnkiConnectClient>()(
  '@memorilo/anki-connect/AnkiConnect',
  { make: makeAnkiConnectClient },
) {}

function makeAnkiConnectClient(config: AnkiConnectConfig = {}): Effect.Effect<AnkiConnectClient, AnkiConnectConfigurationError> {
  return Effect.gen(function* () {
    const normalizedConfig = yield* configuration(config)
    const guiSemaphore = yield* Semaphore.make(1)
    const cacheKey = `client-${nextClientId += 1}`

    const requestUnknown = (input: unknown): Effect.Effect<unknown, AnkiConnectError> => Effect.gen(function* () {
      const request = yield* decodeInput(undefined, 'AnkiConnect request', AnkiRequestSchema, input)
      return yield* Effect.gen(function* () {
        const body = yield* encodeRequestBody(request, normalizedConfig.apiKey)
        const response = yield* Effect.tryPromise({
          try: signal => normalizedConfig.fetch(normalizedConfig.endpoint, {
            body,
            headers: { 'accept': 'application/json', 'content-type': 'application/json' },
            method: 'POST',
            signal,
          }),
          catch: cause => new AnkiConnectNetworkError(
            cause instanceof Error ? cause.message : `Failed to connect to ${normalizedConfig.endpoint}`,
            { action: request.action, cause, endpoint: normalizedConfig.endpoint },
          ),
        })
        if (!response.ok) {
          return yield* new AnkiConnectHttpError({
            action: request.action,
            endpoint: normalizedConfig.endpoint,
            status: response.status,
            statusText: response.statusText,
          })
        }
        const bodyValue = yield* Effect.tryPromise({
          try: () => response.json() as Promise<unknown>,
          catch: cause => new AnkiConnectProtocolError(
            `AnkiConnect ${request.action} returned invalid JSON`,
            { action: request.action, cause },
          ),
        })
        const envelope = yield* decodeProtocol(request.action, 'AnkiConnect response envelope', ResponseEnvelopeSchema, bodyValue)
        if (envelope.error !== null)
          return yield* new AnkiConnectResponseError(request.action, envelope.error)
        return envelope.result
      }).pipe(Effect.withSpan('anki-connect.request', { attributes: { action: request.action } }))
    })

    const requestResult = <S extends Schema.Top & { readonly DecodingServices: never }>(
      input: Schema.Schema.Type<typeof AnkiRequestSchema>,
      description: string,
      schema: S,
    ): Effect.Effect<S['Type'], AnkiConnectError> => requestUnknown(input).pipe(
      Effect.flatMap(value => decodeProtocol(input.action, description, schema, value)),
    )

    const findCards = (query: string): Effect.Effect<readonly number[], AnkiConnectError> => requestResult(
      { action: 'findCards', params: { query } },
      'Anki card identifiers',
      CardIdsSchema,
    ).pipe(Effect.flatMap(ids => uniqueValues(ids, 'findCards', 'Anki card identifiers')))

    const cardsInfo = (cardIds: readonly number[]): Effect.Effect<readonly AnkiCard[], AnkiConnectError> => {
      if (cardIds.length === 0)
        return Effect.succeed([])
      return requestResult(
        { action: 'cardsInfo', params: { cards: cardIds } },
        'Anki cards',
        CardsSchema,
      ).pipe(Effect.flatMap(cards => orderResultsById(cardIds, cards, card => card.cardId, 'cardsInfo', 'card')))
    }

    const notesInfo = (noteIds: readonly number[]): Effect.Effect<readonly AnkiNote[], AnkiConnectError> => {
      if (noteIds.length === 0)
        return Effect.succeed([])
      return requestResult(
        { action: 'notesInfo', params: { notes: noteIds } },
        'Anki notes',
        NotesSchema,
      ).pipe(Effect.flatMap(notes => orderResultsById(noteIds, notes, note => note.noteId, 'notesInfo', 'note')))
    }

    const decks = (): Effect.Effect<readonly AnkiDeck[], AnkiConnectError> => requestResult(
      { action: 'deckNamesAndIds' },
      'Anki deck names and identifiers',
      DeckNamesAndIdsSchema,
    ).pipe(
      Effect.flatMap((decksByName) => {
        const allDecks = Object.entries(decksByName).map(([name, id]) => ({ id, name }))
        return uniqueValues(allDecks.map(deck => deck.id), 'deckNamesAndIds', 'Anki deck identifiers').pipe(
          Effect.as(allDecks),
        )
      }),
    )

    const permission = (): Effect.Effect<AnkiPermission, AnkiConnectError> => requestResult(
      { action: 'requestPermission', params: { allowed: true, origin: '' } },
      'Anki permission',
      PermissionResultSchema,
    ).pipe(
      Effect.flatMap((result) => {
        if (
          result.requireApiKey !== undefined
          && result.requireApikey !== undefined
          && result.requireApiKey !== result.requireApikey
        ) {
          return Effect.fail(new AnkiConnectProtocolError(
            'AnkiConnect permission response contains conflicting API key requirements',
            { action: 'requestPermission' },
          ))
        }
        const requireApiKey = result.requireApiKey ?? result.requireApikey
        return Effect.succeed({
          permission: result.permission,
          ...(requireApiKey === undefined ? {} : { requireApiKey }),
          ...(result.version === undefined ? {} : { version: result.version }),
        })
      }),
    )

    const deckSnapshot = (deck: AnkiDeck): Effect.Effect<AnkiDeckSnapshot, AnkiConnectError> => Effect.gen(function* () {
      const validatedDeck = yield* decodeInput('deckSnapshot', 'Anki deck', Schema.Struct({ id: PositiveIntegerSchema, name: Schema.NonEmptyString }), deck)
      const query = yield* exactDeckQuery(validatedDeck.name)
      const cardIds = yield* findCards(query)
      const cards = yield* cardsInfo(cardIds)
      const uniqueNoteIds = [...new Set(cards.map(card => card.note))]
      const notes = yield* notesInfo(uniqueNoteIds)
      return { cards, deck: validatedDeck, notes }
    }).pipe(Effect.withSpan('anki-connect.deck-snapshot'))

    const guiResult = (action: string, params?: Readonly<Record<string, string | number>>): Effect.Effect<boolean, AnkiConnectError> => requestResult(
      { action, ...(params === undefined ? {} : { params }) },
      `Anki GUI action ${action} result`,
      GuiResultSchema,
    )

    const requireGuiSuccess = (action: string, result: boolean): Effect.Effect<void, AnkiConnectGuiStateError> => result
      ? Effect.void
      : Effect.fail(new AnkiConnectGuiStateError({
          action,
          message: `Anki rejected ${action} because its reviewer GUI is not in the required state`,
        }))

    const readActiveReviewCard = (): Effect.Effect<AnkiReviewerCard, AnkiConnectError> => Effect.gen(function* () {
      const result = yield* requestResult(
        { action: 'guiCurrentCard' },
        'Anki reviewer card',
        ReviewerCardResultSchema,
      )
      if (result.buttons.length !== result.nextReviews.length) {
        return yield* new AnkiConnectProtocolError(
          `Anki reviewer card ${result.cardId} returned ${result.buttons.length} answer buttons but ${result.nextReviews.length} next-review intervals`,
          { action: 'guiCurrentCard' },
        )
      }
      yield* uniqueValues(result.buttons, 'guiCurrentCard', 'Anki reviewer answer buttons')
      const answerOptions = []
      for (const [index, rating] of result.buttons.entries()) {
        const nextReview = result.nextReviews[index]
        if (nextReview === undefined) {
          return yield* new AnkiConnectProtocolError(
            `Anki reviewer card ${result.cardId} omitted the interval for rating ${rating}`,
            { action: 'guiCurrentCard' },
          )
        }
        answerOptions.push({ nextReview, rating })
      }
      return {
        answer: result.answer,
        answerOptions,
        cardId: result.cardId,
        css: result.css,
        deckName: result.deckName,
        fieldOrder: result.fieldOrder,
        fields: result.fields,
        modelName: result.modelName,
        question: result.question,
        template: result.template,
      }
    })

    const reviewActiveUnlocked = (): Effect.Effect<boolean, AnkiConnectError> => guiResult('guiReviewActive')

    const currentReviewCardUnlocked = (): Effect.Effect<AnkiReviewerCard | null, AnkiConnectError> => reviewActiveUnlocked().pipe(
      Effect.flatMap(active => active ? readActiveReviewCard() : Effect.succeed(null)),
    )

    const requireCurrentReviewCard = (cardId: number, action: string): Effect.Effect<AnkiReviewerCard, AnkiConnectError> => Effect.gen(function* () {
      const current = yield* currentReviewCardUnlocked()
      if (current === null) {
        return yield* new AnkiConnectGuiStateError({
          action,
          message: `Cannot run ${action} because Anki's reviewer is not active`,
        })
      }
      if (current.cardId !== cardId) {
        return yield* new AnkiConnectGuiStateError({
          action,
          message: `Cannot run ${action} for card ${cardId} because Anki is currently showing card ${current.cardId}`,
        })
      }
      return current
    })

    const withGuiLock = <A>(operation: Effect.Effect<A, AnkiConnectError>): Effect.Effect<A, AnkiConnectError> => (
      guiSemaphore.withPermits(1)(operation)
    )

    const reviewActive = (): Effect.Effect<boolean, AnkiConnectError> => withGuiLock(reviewActiveUnlocked())

    const currentReviewCard = (): Effect.Effect<AnkiReviewerCard | null, AnkiConnectError> => withGuiLock(currentReviewCardUnlocked())

    const startReview = (deck: AnkiDeck): Effect.Effect<AnkiReviewerCard | null, AnkiConnectError> => withGuiLock(Effect.gen(function* () {
      const validatedDeck = yield* decodeInput('guiDeckReview', 'Anki deck', Schema.Struct({ id: PositiveIntegerSchema, name: Schema.NonEmptyString }), deck)
      const started = yield* guiResult('guiDeckReview', { name: validatedDeck.name })
      yield* requireGuiSuccess('guiDeckReview', started)
      return yield* currentReviewCardUnlocked()
    }).pipe(Effect.withSpan('anki-connect.gui.start-review')))

    const showReviewSide = (
      action: 'guiShowAnswer' | 'guiShowQuestion',
      input: AnkiReviewCardInput,
    ): Effect.Effect<AnkiReviewerCard, AnkiConnectError> => withGuiLock(Effect.gen(function* () {
      const validated = yield* decodeInput(action, 'Anki reviewer card input', AnkiReviewCardInputSchema, input)
      const current = yield* requireCurrentReviewCard(validated.cardId, action)
      const shown = yield* guiResult(action)
      yield* requireGuiSuccess(action, shown)
      return current
    }))

    const showReviewQuestion = (input: AnkiReviewCardInput) => showReviewSide('guiShowQuestion', input)
    const showReviewAnswer = (input: AnkiReviewCardInput) => showReviewSide('guiShowAnswer', input)

    const startReviewCardTimer = (input: AnkiReviewCardInput): Effect.Effect<void, AnkiConnectError> => withGuiLock(Effect.gen(function* () {
      const validated = yield* decodeInput('guiStartCardTimer', 'Anki reviewer card input', AnkiReviewCardInputSchema, input)
      yield* requireCurrentReviewCard(validated.cardId, 'guiStartCardTimer')
      const started = yield* guiResult('guiStartCardTimer')
      yield* requireGuiSuccess('guiStartCardTimer', started)
    }))

    const answerReviewCard = (input: AnkiReviewAnswerInput): Effect.Effect<AnkiReviewerCard | null, AnkiConnectError> => withGuiLock(Effect.gen(function* () {
      const validated = yield* decodeInput('guiAnswerCard', 'Anki reviewer answer', AnkiReviewAnswerInputSchema, input)
      const current = yield* requireCurrentReviewCard(validated.cardId, 'guiAnswerCard')
      if (!current.answerOptions.some(option => option.rating === validated.rating)) {
        return yield* new AnkiConnectInputError(
          `Rating ${validated.rating} is not available for Anki card ${validated.cardId}`,
          { action: 'guiAnswerCard' },
        )
      }
      const answered = yield* guiResult('guiAnswerCard', { ease: validated.rating })
      yield* requireGuiSuccess('guiAnswerCard', answered)
      return yield* currentReviewCardUnlocked()
    }).pipe(Effect.withSpan('anki-connect.gui.answer-review-card')))

    const playReviewAudio = (input: AnkiReviewCardInput): Effect.Effect<void, AnkiConnectError> => withGuiLock(Effect.gen(function* () {
      const validated = yield* decodeInput('guiPlayAudio', 'Anki reviewer card input', AnkiReviewCardInputSchema, input)
      yield* requireCurrentReviewCard(validated.cardId, 'guiPlayAudio')
      const played = yield* guiResult('guiPlayAudio')
      yield* requireGuiSuccess('guiPlayAudio', played)
    }))

    const endReview = (): Effect.Effect<void, AnkiConnectError> => withGuiLock(Effect.gen(function* () {
      yield* requestResult(
        { action: 'guiDeckBrowser' },
        'Anki GUI action guiDeckBrowser result',
        Schema.Null,
      )
      const active = yield* reviewActiveUnlocked()
      if (active) {
        return yield* new AnkiConnectGuiStateError({
          action: 'guiDeckBrowser',
          message: 'Anki remained in review mode after guiDeckBrowser',
        })
      }
    }))

    const retrieveMediaFile = (filename: string): Effect.Effect<string | null, AnkiConnectError> => Effect.gen(function* () {
      const validatedFilename = yield* decodeInput('retrieveMediaFile', 'Anki media filename', Schema.NonEmptyString, filename)
      if (validatedFilename.trim().length === 0)
        return yield* new AnkiConnectInputError('Anki media filename cannot be empty', { action: 'retrieveMediaFile' })
      const result = yield* requestResult(
        { action: 'retrieveMediaFile', params: { filename: validatedFilename } },
        `Anki media file ${validatedFilename}`,
        MediaResultSchema,
      )
      return result === false ? null : result
    })

    const collectionSnapshot = (): Effect.Effect<AnkiCollectionSnapshot, AnkiConnectError> => Effect.gen(function* () {
      const allDecks = yield* decks()
      const snapshots = yield* Effect.forEach(allDecks, deckSnapshot, { concurrency: 1 })
      return { decks: snapshots }
    }).pipe(Effect.withSpan('anki-connect.collection-snapshot'))

    return {
      answerReviewCard,
      cacheKey,
      collectionSnapshot,
      currentReviewCard,
      deckSnapshot,
      decks,
      endReview,
      hasApiKey: normalizedConfig.apiKey !== undefined,
      permission,
      playReviewAudio,
      retrieveMediaFile,
      reviewActive,
      showReviewAnswer,
      showReviewQuestion,
      startReview,
      startReviewCardTimer,
    }
  })
}

export function ankiConnectLayer(config: AnkiConnectConfig = {}): Layer.Layer<AnkiConnect, AnkiConnectConfigurationError> {
  return Layer.effect(AnkiConnect)(AnkiConnect.make(config))
}
