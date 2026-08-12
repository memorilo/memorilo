export interface AnkiConnectConfig {
  readonly apiKey?: string
  readonly endpoint?: string
}

export interface AnkiDeck {
  readonly id: number
  readonly name: string
}

export interface AnkiField {
  readonly order: number
  readonly value: string
}

export interface AnkiCard {
  readonly answer: string
  readonly cardId: number
  readonly css: string
  readonly deckName: string
  readonly due: number
  readonly fieldOrder: number
  readonly fields: Readonly<Record<string, AnkiField>>
  readonly interval: number
  readonly lapses: number
  readonly left: number
  readonly modelName: string
  readonly mod: number
  readonly nextReviews: readonly string[]
  readonly note: number
  readonly ord: number
  readonly queue: number
  readonly question: string
  readonly reps: number
  readonly type: number
}

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

export interface AnkiNote {
  readonly cards: readonly number[]
  readonly fields: Readonly<Record<string, AnkiField>>
  readonly mod: number
  readonly modelName: string
  readonly noteId: number
  readonly profile: string
  readonly tags: readonly string[]
}

export type AnkiReviewRating = 1 | 2 | 3 | 4

export interface AnkiReview {
  readonly ease: number
  readonly factor: number
  readonly id: number
  readonly ivl: number
  readonly lastIvl: number
  readonly time: number
  readonly type: number
  readonly usn: number
}

export interface AnkiDeckSnapshot {
  readonly cards: readonly AnkiCard[]
  readonly deck: AnkiDeck
  readonly notes: readonly AnkiNote[]
  readonly queue: readonly AnkiCard[]
}

export interface AnkiCollectionSnapshot {
  readonly decks: readonly AnkiDeckSnapshot[]
}

export interface AnkiPermission {
  readonly permission: 'denied' | 'granted'
  readonly requireApiKey?: boolean
  readonly version?: number
}

export interface AnkiRequest {
  readonly action: string
  readonly params?: Readonly<Record<string, unknown>>
  readonly version?: number
}

export type AnkiConnectError
  = | AnkiConnectNetworkError
    | AnkiConnectProtocolError
    | AnkiConnectResponseError

export class AnkiConnectNetworkError extends Error {
  readonly _tag = 'AnkiConnectNetworkError'
  constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'AnkiConnectNetworkError'
  }
}

export class AnkiConnectProtocolError extends Error {
  readonly _tag = 'AnkiConnectProtocolError'
  constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'AnkiConnectProtocolError'
  }
}

export class AnkiConnectResponseError extends Error {
  readonly _tag = 'AnkiConnectResponseError'
  readonly action: string
  constructor(action: string, message: string, options?: ErrorOptions) {
    super(message, options)
    this.action = action
    this.name = 'AnkiConnectResponseError'
  }
}
