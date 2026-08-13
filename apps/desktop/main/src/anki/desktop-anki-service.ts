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
  client: Promise<AnkiConnectClient>
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

  const currentClient = (): Promise<AnkiConnectClient> => {
    const anki = ankiConfiguration()
    const signature = JSON.stringify([anki.host, anki.port, anki.apiKey])
    if (configuredClient?.signature === signature)
      return configuredClient.client
    const client = Effect.runPromise(AnkiConnect.make({
      ...(anki.apiKey.length === 0 ? {} : { apiKey: anki.apiKey }),
      endpoint: endpoint(anki),
    }))
    configuredClient = { client, signature }
    return client
  }

  const activeReviewClient = (): AnkiConnectClient => {
    ankiConfiguration()
    if (!reviewClient)
      throw new Error('Anki review is not active')
    return reviewClient
  }

  const runReviewOperation = <Result>(operation: () => Promise<Result>): Promise<Result> => (
    Effect.runPromise(reviewOperations.withPermit(Effect.promise(operation)))
  )

  const endActiveReview = async (): Promise<void> => {
    if (!reviewClient)
      return
    const client = reviewClient
    await Effect.runPromise(client.endReview())
    reviewClient = null
    reviewDeckId = null
  }

  return {
    answerReviewCard: input => runReviewOperation(async () => {
      const client = activeReviewClient()
      const next = await Effect.runPromise(client.answerReviewCard(input))
      if (next)
        await Effect.runPromise(client.startReviewCardTimer({ cardId: next.cardId }))
      return next
    }),
    currentReviewCard: () => runReviewOperation(() => Effect.runPromise(activeReviewClient().currentReviewCard())),
    deckSnapshot: async deck => Effect.runPromise((await currentClient()).deckSnapshot(deck)),
    decks: async () => configuration.getSnapshot().anki.enabled
      ? Effect.runPromise((await currentClient()).decks())
      : [],
    endReview: () => runReviewOperation(async () => {
      if (!configuration.getSnapshot().anki.enabled) {
        reviewClient = null
        reviewDeckId = null
        return
      }
      await endActiveReview()
    }),
    playReviewAudio: input => runReviewOperation(() => Effect.runPromise(activeReviewClient().playReviewAudio(input))),
    retrieveMediaFile: async filename => Effect.runPromise(activeReviewClient().retrieveMediaFile(filename)),
    showReviewAnswer: input => runReviewOperation(() => Effect.runPromise(activeReviewClient().showReviewAnswer(input))),
    startReview: deck => runReviewOperation(async () => {
      if (reviewClient) {
        if (reviewDeckId === deck.id)
          return Effect.runPromise(reviewClient.currentReviewCard())
        await endActiveReview()
      }
      const client = await currentClient()
      try {
        const card = await Effect.runPromise(client.startReview(deck))
        if (card)
          await Effect.runPromise(client.startReviewCardTimer({ cardId: card.cardId }))
        reviewClient = client
        reviewDeckId = deck.id
        return card
      }
      catch (error) {
        try {
          await Effect.runPromise(client.endReview())
        }
        catch (cleanupError) {
          console.error('Failed to leave Anki review after its startup failed', cleanupError)
        }
        throw error
      }
    }),
  }
}
