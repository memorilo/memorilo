import type { AnkiConnectClient } from './client'
import type {
  AnkiCardMedia,
  AnkiCollectionSnapshot,
  AnkiConnectError,
  AnkiDeck,
  AnkiDeckSnapshot,
  AnkiPermission,
  AnkiRenderableCard,
  AnkiReviewAnswerInput,
  AnkiReviewCardInput,
  AnkiReviewerCard,
} from './model'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Effect, Layer } from 'effect'
import { createEffectQuery } from 'effect-query'
import { resolveAnkiCardMedia } from './media'
import { AnkiConnectInputError } from './model'

export interface AnkiQueryOptions {
  readonly client: AnkiConnectClient
  readonly enabled?: boolean
  readonly staleTime?: number
}

const effectQuery = createEffectQuery(Layer.empty)

function reviewerCardRevision(card: AnkiReviewerCard): string {
  let hash = 2_166_136_261
  for (const value of [card.question, card.answer, card.css]) {
    for (let index = 0; index < value.length; index += 1) {
      hash ^= value.charCodeAt(index)
      hash = Math.imul(hash, 16_777_619)
    }
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

export const ankiQueryKeys = {
  all: ['anki'] as const,
  client: (clientKey: string) => [...ankiQueryKeys.all, clientKey] as const,
  collection: (clientKey = 'default') => [...ankiQueryKeys.client(clientKey), 'collection'] as const,
  decks: (clientKey = 'default') => [...ankiQueryKeys.client(clientKey), 'decks'] as const,
  media: (card: AnkiRenderableCard, clientKey = 'default') => [
    ...ankiQueryKeys.client(clientKey),
    'media',
    card.cardId,
    ...('mod' in card
      ? ['snapshot', card.mod]
      : ['reviewer', reviewerCardRevision(card)]),
  ] as const,
  permission: (clientKey = 'default') => [...ankiQueryKeys.client(clientKey), 'permission'] as const,
  review: (clientKey = 'default') => [...ankiQueryKeys.client(clientKey), 'review'] as const,
  snapshots: (clientKey = 'default') => [...ankiQueryKeys.client(clientKey), 'deck'] as const,
  snapshot: (deckId: number, clientKey = 'default') => [...ankiQueryKeys.client(clientKey), 'deck', deckId] as const,
}

export function ankiPermissionQueryOptions({ client, enabled = true, staleTime = 5_000 }: AnkiQueryOptions) {
  return effectQuery.queryOptions<AnkiPermission, AnkiConnectError, never>({
    enabled,
    queryFn: () => client.permission(),
    queryKey: ankiQueryKeys.permission(client.cacheKey),
    staleTime,
  })
}

export function ankiDecksQueryOptions({ client, enabled = true, staleTime = 30_000 }: AnkiQueryOptions) {
  return effectQuery.queryOptions<readonly AnkiDeck[], AnkiConnectError, never>({
    enabled,
    queryFn: () => client.decks(),
    queryKey: ankiQueryKeys.decks(client.cacheKey),
    staleTime,
  })
}

export function ankiCollectionQueryOptions({ client, enabled = true, staleTime = 10_000 }: AnkiQueryOptions) {
  return effectQuery.queryOptions<AnkiCollectionSnapshot, AnkiConnectError, never>({
    enabled,
    queryFn: () => client.collectionSnapshot(),
    queryKey: ankiQueryKeys.collection(client.cacheKey),
    staleTime,
  })
}

export function ankiDeckSnapshotQueryOptions({ client, deck, enabled = true, staleTime = 10_000 }: AnkiQueryOptions & { readonly deck: AnkiDeck }) {
  return effectQuery.queryOptions<AnkiDeckSnapshot, AnkiConnectError, never>({
    enabled,
    queryFn: () => client.deckSnapshot(deck),
    queryKey: ankiQueryKeys.snapshot(deck.id, client.cacheKey),
    staleTime,
  })
}

export function ankiCardMediaQueryOptions({ card, client, enabled = true, staleTime = Number.POSITIVE_INFINITY }: AnkiQueryOptions & { readonly card: AnkiRenderableCard }) {
  return effectQuery.queryOptions<AnkiCardMedia, AnkiConnectError, never>({
    enabled,
    queryFn: () => resolveAnkiCardMedia(client, card),
    queryKey: ankiQueryKeys.media(card, client.cacheKey),
    staleTime,
  })
}

export function ankiCurrentReviewCardQueryOptions({ client, enabled = true, staleTime = 0 }: AnkiQueryOptions) {
  return effectQuery.queryOptions<AnkiReviewerCard | null, AnkiConnectError, never>({
    enabled,
    queryFn: () => client.currentReviewCard(),
    queryKey: ankiQueryKeys.review(client.cacheKey),
    staleTime,
  })
}

export function ankiStartReviewMutationOptions({ client }: { readonly client: AnkiConnectClient }) {
  return effectQuery.mutationOptions<AnkiReviewerCard | null, AnkiConnectError, never, AnkiDeck>({
    mutationFn: deck => client.startReview(deck),
  })
}

export function ankiShowReviewAnswerMutationOptions({ client }: { readonly client: AnkiConnectClient }) {
  return effectQuery.mutationOptions<AnkiReviewerCard, AnkiConnectError, never, AnkiReviewCardInput>({
    mutationFn: input => client.showReviewAnswer(input),
  })
}

export function ankiShowReviewQuestionMutationOptions({ client }: { readonly client: AnkiConnectClient }) {
  return effectQuery.mutationOptions<AnkiReviewerCard, AnkiConnectError, never, AnkiReviewCardInput>({
    mutationFn: input => client.showReviewQuestion(input),
  })
}

export function ankiStartReviewCardTimerMutationOptions({ client }: { readonly client: AnkiConnectClient }) {
  return effectQuery.mutationOptions<void, AnkiConnectError, never, AnkiReviewCardInput>({
    mutationFn: input => client.startReviewCardTimer(input),
  })
}

export function ankiAnswerReviewCardMutationOptions({ client }: { readonly client: AnkiConnectClient }) {
  return effectQuery.mutationOptions<AnkiReviewerCard | null, AnkiConnectError, never, AnkiReviewAnswerInput>({
    mutationFn: input => client.answerReviewCard(input),
  })
}

export function ankiPlayReviewAudioMutationOptions({ client }: { readonly client: AnkiConnectClient }) {
  return effectQuery.mutationOptions<void, AnkiConnectError, never, AnkiReviewCardInput>({
    mutationFn: input => client.playReviewAudio(input),
  })
}

export function ankiEndReviewMutationOptions({ client }: { readonly client: AnkiConnectClient }) {
  return effectQuery.mutationOptions<void, AnkiConnectError, never, void>({
    mutationFn: () => client.endReview(),
  })
}

export function useAnkiPermission(options: AnkiQueryOptions) {
  return useQuery(ankiPermissionQueryOptions(options))
}

export function useAnkiDecks(options: AnkiQueryOptions) {
  return useQuery(ankiDecksQueryOptions(options))
}

export function useAnkiCollection(options: AnkiQueryOptions) {
  return useQuery(ankiCollectionQueryOptions(options))
}

export function useAnkiDeckSnapshot(options: AnkiQueryOptions & { readonly deck: AnkiDeck | null }) {
  return useQuery(options.deck === null
    ? effectQuery.queryOptions<AnkiDeckSnapshot, AnkiConnectError, never>({
        enabled: false,
        queryFn: () => Effect.fail(new AnkiConnectInputError('Anki deck snapshot requires a selected deck')),
        queryKey: [...ankiQueryKeys.client(options.client.cacheKey), 'deck', 'none'],
      })
    : ankiDeckSnapshotQueryOptions({ ...options, deck: options.deck }))
}

export function useCurrentAnkiReviewCard(options: AnkiQueryOptions) {
  return useQuery(ankiCurrentReviewCardQueryOptions(options))
}

export function useAnkiCardMedia(options: AnkiQueryOptions & { readonly card: AnkiRenderableCard | null }) {
  return useQuery(options.card === null
    ? effectQuery.queryOptions<AnkiCardMedia, AnkiConnectError, never>({
        enabled: false,
        queryFn: () => Effect.fail(new AnkiConnectInputError('Anki card media requires a selected card')),
        queryKey: [...ankiQueryKeys.client(options.client.cacheKey), 'media', 'none'],
      })
    : ankiCardMediaQueryOptions({ ...options, card: options.card }))
}

export function useStartAnkiReview(options: { readonly client: AnkiConnectClient }) {
  const queryClient = useQueryClient()
  return useMutation({
    ...ankiStartReviewMutationOptions(options),
    onSuccess: card => queryClient.setQueryData(ankiQueryKeys.review(options.client.cacheKey), card),
  })
}

export function useShowAnkiReviewAnswer(options: { readonly client: AnkiConnectClient }) {
  return useMutation(ankiShowReviewAnswerMutationOptions(options))
}

export function useShowAnkiReviewQuestion(options: { readonly client: AnkiConnectClient }) {
  return useMutation(ankiShowReviewQuestionMutationOptions(options))
}

export function useStartAnkiReviewCardTimer(options: { readonly client: AnkiConnectClient }) {
  return useMutation(ankiStartReviewCardTimerMutationOptions(options))
}

export function useAnswerAnkiReviewCard(options: { readonly client: AnkiConnectClient }) {
  const queryClient = useQueryClient()
  return useMutation({
    ...ankiAnswerReviewCardMutationOptions(options),
    onSuccess: (card) => {
      queryClient.setQueryData(ankiQueryKeys.review(options.client.cacheKey), card)
      void queryClient.invalidateQueries({ queryKey: ankiQueryKeys.collection(options.client.cacheKey) })
      void queryClient.invalidateQueries({ queryKey: ankiQueryKeys.snapshots(options.client.cacheKey) })
    },
  })
}

export function usePlayAnkiReviewAudio(options: { readonly client: AnkiConnectClient }) {
  return useMutation(ankiPlayReviewAudioMutationOptions(options))
}

export function useEndAnkiReview(options: { readonly client: AnkiConnectClient }) {
  const queryClient = useQueryClient()
  return useMutation({
    ...ankiEndReviewMutationOptions(options),
    onSuccess: () => queryClient.setQueryData(ankiQueryKeys.review(options.client.cacheKey), null),
  })
}
