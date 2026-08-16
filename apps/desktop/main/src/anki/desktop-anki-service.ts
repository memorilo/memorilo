import type {
  AnkiConnectClient,
} from '@memorilo/anki-connect/client'
import type {
  AnkiDeck,
  AnkiDeckSnapshot,
  AnkiReviewAnswerInput,
  AnkiReviewCardInput,
  AnkiReviewerCard,
} from '@memorilo/anki-connect/model'
import type { ConfigurationStore } from '@memorilo/config'
import type { DesktopConfiguration } from '@memorilo/desktop-config'
import { AnkiConnect } from '@memorilo/anki-connect/client'
import { combineLifecycleFailures, toError } from '@memorilo/effect-lifecycle'
import { Effect, Semaphore } from 'effect'

export interface DesktopAnkiService {
  answerReviewCard: (input: AnkiReviewAnswerInput) => Promise<AnkiReviewerCard | null>
  currentReviewCard: () => Promise<AnkiReviewerCard | null>
  deckSnapshot: (deck: AnkiDeck) => Promise<AnkiDeckSnapshot>
  decks: () => Promise<readonly AnkiDeck[]>
  endReview: () => Promise<void>
  playReviewAudio: (input: AnkiReviewCardInput) => Promise<void>
  retrieveMediaFile: (filename: string) => Promise<string | null>
  showReviewAnswer: (input: AnkiReviewCardInput) => Promise<AnkiReviewerCard>
  startReview: (deck: AnkiDeck) => Promise<AnkiReviewerCard | null>
}

interface ConfiguredClient {
  client: AnkiConnectClient
  signature: string
}

function endpoint(configuration: DesktopConfiguration['anki']): string {
  const host = configuration.host.includes(':') && !configuration.host.startsWith('[')
    ? `[${configuration.host}]`
    : configuration.host
  return new URL(`http://${host}:${configuration.port}`).toString()
}

export function createDesktopAnkiService(
  configuration: ConfigurationStore<DesktopConfiguration>,
): DesktopAnkiService {
  let configuredClient: ConfiguredClient | null = null
  let reviewClient: AnkiConnectClient | null = null
  let reviewDeckId: number | null = null
  const reviewOperations = Semaphore.makeUnsafe(1)

  const ankiConfiguration = (): DesktopConfiguration['anki'] => {
    const anki = configuration.getSnapshot().anki
    if (!anki.enabled)
      throw new Error('AnkiConnect is disabled in Settings')
    return anki
  }

  const readAnkiConfiguration = () => Effect.try({
    catch: toError,
    try: ankiConfiguration,
  })

  const currentClient = () => Effect.gen(function* () {
    const anki = yield* readAnkiConfiguration()
    const signature = JSON.stringify([anki.host, anki.port, anki.apiKey])
    if (configuredClient?.signature === signature)
      return configuredClient.client
    const client = yield* AnkiConnect.make({
      ...(anki.apiKey.length === 0 ? {} : { apiKey: anki.apiKey }),
      endpoint: endpoint(anki),
    })
    configuredClient = { client, signature }
    return client
  })

  const activeReviewClient = () => Effect.gen(function* () {
    yield* readAnkiConfiguration()
    if (!reviewClient)
      return yield* Effect.fail(new Error('Anki review is not active'))
    return reviewClient
  })

  const runOperation = <Result, Failure>(operation: Effect.Effect<Result, Failure>): Promise<Result> => (
    Effect.runPromise(operation)
  )

  const runReviewOperation = <Result, Failure>(operation: Effect.Effect<Result, Failure>): Promise<Result> => (
    runOperation(reviewOperations.withPermit(operation))
  )

  const endActiveReview = () => Effect.gen(function* () {
    if (!reviewClient)
      return
    const client = reviewClient
    yield* client.endReview()
    reviewClient = null
    reviewDeckId = null
  })

  return {
    answerReviewCard: input => runReviewOperation(Effect.gen(function* () {
      const client = yield* activeReviewClient()
      const next = yield* client.answerReviewCard(input)
      if (next)
        yield* client.startReviewCardTimer({ cardId: next.cardId })
      return next
    })),
    currentReviewCard: () => runReviewOperation(Effect.flatMap(
      activeReviewClient(),
      client => client.currentReviewCard(),
    )),
    deckSnapshot: deck => runOperation(Effect.flatMap(
      currentClient(),
      client => client.deckSnapshot(deck),
    )),
    decks: () => runOperation(configuration.getSnapshot().anki.enabled
      ? Effect.flatMap(currentClient(), client => client.decks())
      : Effect.succeed([])),
    endReview: () => runReviewOperation(Effect.suspend(() => {
      if (!configuration.getSnapshot().anki.enabled) {
        reviewClient = null
        reviewDeckId = null
        return Effect.void
      }
      return endActiveReview()
    })),
    playReviewAudio: input => runReviewOperation(Effect.flatMap(
      activeReviewClient(),
      client => client.playReviewAudio(input),
    )),
    retrieveMediaFile: filename => runOperation(Effect.flatMap(
      activeReviewClient(),
      client => client.retrieveMediaFile(filename),
    )),
    showReviewAnswer: input => runReviewOperation(Effect.flatMap(
      activeReviewClient(),
      client => client.showReviewAnswer(input),
    )),
    startReview: deck => runReviewOperation(Effect.gen(function* () {
      if (reviewClient) {
        if (reviewDeckId === deck.id)
          return yield* reviewClient.currentReviewCard()
        yield* endActiveReview()
      }
      const client = yield* currentClient()
      const card = yield* Effect.gen(function* () {
        const started = yield* client.startReview(deck)
        if (started)
          yield* client.startReviewCardTimer({ cardId: started.cardId })
        return started
      }).pipe(Effect.catchEager(startupError => client.endReview().pipe(
        Effect.catchEager(cleanupError => Effect.fail(combineLifecycleFailures(
          [startupError, cleanupError],
          `Failed to start and leave Anki review for Deck ${deck.id}`,
        ))),
        Effect.andThen(Effect.fail(startupError)),
      )))
      reviewClient = client
      reviewDeckId = deck.id
      return card
    })),
  }
}
