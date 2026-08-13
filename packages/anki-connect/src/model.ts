import { Data, Schema } from 'effect'

const PositiveIntegerSchema = Schema.Int.check(Schema.isGreaterThan(0))
const NonNegativeIntegerSchema = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))

export type AnkiConnectFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

export interface AnkiConnectConfig {
  readonly apiKey?: string
  readonly endpoint?: string
  readonly fetch?: AnkiConnectFetch
}

export const AnkiDeckSchema = Schema.Struct({
  id: PositiveIntegerSchema,
  name: Schema.NonEmptyString,
})
export type AnkiDeck = Schema.Schema.Type<typeof AnkiDeckSchema>

export const AnkiFieldSchema = Schema.Struct({
  order: NonNegativeIntegerSchema,
  value: Schema.String,
})
export type AnkiField = Schema.Schema.Type<typeof AnkiFieldSchema>

export const AnkiCardSchema = Schema.Struct({
  answer: Schema.String,
  cardId: PositiveIntegerSchema,
  css: Schema.String,
  deckName: Schema.NonEmptyString,
  fieldOrder: NonNegativeIntegerSchema,
  fields: Schema.Record(Schema.String, AnkiFieldSchema),
  lapses: NonNegativeIntegerSchema,
  modelName: Schema.NonEmptyString,
  mod: NonNegativeIntegerSchema,
  note: PositiveIntegerSchema,
  ord: NonNegativeIntegerSchema,
  question: Schema.String,
  reps: NonNegativeIntegerSchema,
})
export type AnkiCard = Schema.Schema.Type<typeof AnkiCardSchema>

export interface AnkiMediaFile {
  readonly dataUrl: string
  readonly filename: string
  readonly mimeType: string
  readonly stylesheet?: string
}

export interface AnkiCardMedia {
  readonly files: Readonly<Record<string, AnkiMediaFile>>
  readonly missing: readonly string[]
}

export const AnkiNoteSchema = Schema.Struct({
  cards: Schema.Array(PositiveIntegerSchema),
  fields: Schema.Record(Schema.String, AnkiFieldSchema),
  mod: NonNegativeIntegerSchema,
  modelName: Schema.NonEmptyString,
  noteId: PositiveIntegerSchema,
  profile: Schema.String,
  tags: Schema.Array(Schema.String),
})
export type AnkiNote = Schema.Schema.Type<typeof AnkiNoteSchema>

export const AnkiReviewRatingSchema = Schema.Literals([1, 2, 3, 4])
export type AnkiReviewRating = Schema.Schema.Type<typeof AnkiReviewRatingSchema>

export const AnkiReviewAnswerOptionSchema = Schema.Struct({
  nextReview: Schema.String,
  rating: AnkiReviewRatingSchema,
})
export type AnkiReviewAnswerOption = Schema.Schema.Type<typeof AnkiReviewAnswerOptionSchema>

export const AnkiReviewerCardSchema = Schema.Struct({
  answer: Schema.String,
  answerOptions: Schema.Array(AnkiReviewAnswerOptionSchema),
  cardId: PositiveIntegerSchema,
  css: Schema.String,
  deckName: Schema.NonEmptyString,
  fieldOrder: NonNegativeIntegerSchema,
  fields: Schema.Record(Schema.String, AnkiFieldSchema),
  modelName: Schema.NonEmptyString,
  question: Schema.String,
  template: Schema.NonEmptyString,
})
export type AnkiReviewerCard = Schema.Schema.Type<typeof AnkiReviewerCardSchema>
export type AnkiRenderableCard = AnkiCard | AnkiReviewerCard

export const AnkiReviewCardInputSchema = Schema.Struct({
  cardId: PositiveIntegerSchema,
})
export type AnkiReviewCardInput = Schema.Schema.Type<typeof AnkiReviewCardInputSchema>

export const AnkiReviewAnswerInputSchema = Schema.Struct({
  cardId: PositiveIntegerSchema,
  rating: AnkiReviewRatingSchema,
})
export type AnkiReviewAnswerInput = Schema.Schema.Type<typeof AnkiReviewAnswerInputSchema>

export const AnkiReviewSchema = Schema.Struct({
  ease: Schema.Int,
  factor: Schema.Int,
  id: PositiveIntegerSchema,
  ivl: Schema.Int,
  lastIvl: Schema.Int,
  time: NonNegativeIntegerSchema,
  type: Schema.Int,
  usn: Schema.Int,
})
export type AnkiReview = Schema.Schema.Type<typeof AnkiReviewSchema>

export interface AnkiDeckSnapshot {
  readonly cards: readonly AnkiCard[]
  readonly deck: AnkiDeck
  readonly notes: readonly AnkiNote[]
}

export interface AnkiCollectionSnapshot {
  readonly decks: readonly AnkiDeckSnapshot[]
}

export interface AnkiPermission {
  readonly permission: 'denied' | 'granted'
  readonly requireApiKey?: boolean
  readonly version?: number
}

export const AnkiRequestSchema = Schema.Struct({
  action: Schema.NonEmptyString,
  params: Schema.optionalKey(Schema.Record(Schema.String, Schema.Json)),
  version: Schema.optionalKey(PositiveIntegerSchema),
})
export type AnkiRequest = Schema.Schema.Type<typeof AnkiRequestSchema>

// eslint-disable-next-line unicorn/throw-new-error
export class AnkiConnectConfigurationError extends Data.TaggedError('AnkiConnectConfigurationError')<{
  cause?: unknown
  message: string
}> {
  constructor(message: string, options?: ErrorOptions) {
    super({ message, ...(options && 'cause' in options ? { cause: options.cause } : {}) })
  }
}

// eslint-disable-next-line unicorn/throw-new-error
export class AnkiConnectInputError extends Data.TaggedError('AnkiConnectInputError')<{
  action?: string
  cause?: unknown
  message: string
}> {
  constructor(message: string, options?: ErrorOptions & { readonly action?: string }) {
    super({
      message,
      ...(options?.action === undefined ? {} : { action: options.action }),
      ...(options && 'cause' in options ? { cause: options.cause } : {}),
    })
  }
}

// eslint-disable-next-line unicorn/throw-new-error
export class AnkiConnectNetworkError extends Data.TaggedError('AnkiConnectNetworkError')<{
  action?: string
  cause?: unknown
  endpoint?: string
  message: string
}> {
  constructor(message: string, options?: ErrorOptions & { readonly action?: string, readonly endpoint?: string }) {
    super({
      message,
      ...(options?.action === undefined ? {} : { action: options.action }),
      ...(options?.endpoint === undefined ? {} : { endpoint: options.endpoint }),
      ...(options && 'cause' in options ? { cause: options.cause } : {}),
    })
  }
}

// eslint-disable-next-line unicorn/throw-new-error
export class AnkiConnectHttpError extends Data.TaggedError('AnkiConnectHttpError')<{
  action: string
  endpoint: string
  message: string
  status: number
  statusText: string
}> {
  constructor(input: { readonly action: string, readonly endpoint: string, readonly status: number, readonly statusText: string }) {
    super({ ...input, message: `AnkiConnect returned HTTP ${input.status}${input.statusText ? ` ${input.statusText}` : ''}` })
  }
}

// eslint-disable-next-line unicorn/throw-new-error
export class AnkiConnectProtocolError extends Data.TaggedError('AnkiConnectProtocolError')<{
  action?: string
  cause?: unknown
  message: string
}> {
  constructor(message: string, options?: ErrorOptions & { readonly action?: string }) {
    super({
      message,
      ...(options?.action === undefined ? {} : { action: options.action }),
      ...(options && 'cause' in options ? { cause: options.cause } : {}),
    })
  }
}

// eslint-disable-next-line unicorn/throw-new-error
export class AnkiConnectResponseError extends Data.TaggedError('AnkiConnectResponseError')<{
  action: string
  cause?: unknown
  message: string
}> {
  constructor(action: string, message: string, options?: ErrorOptions) {
    super({ action, message, ...(options && 'cause' in options ? { cause: options.cause } : {}) })
  }
}

// eslint-disable-next-line unicorn/throw-new-error
export class AnkiConnectGuiStateError extends Data.TaggedError('AnkiConnectGuiStateError')<{
  action: string
  message: string
}> {}

export type AnkiConnectError
  = | AnkiConnectGuiStateError
    | AnkiConnectHttpError
    | AnkiConnectInputError
    | AnkiConnectNetworkError
    | AnkiConnectProtocolError
    | AnkiConnectResponseError
