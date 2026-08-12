import type { QueryKey, UseMutationOptions, UseMutationResult, UseQueryOptions, UseQueryResult } from '@tanstack/react-query'
import type { Cause } from 'effect'
import type { AnkiConnectClient } from './client'
import type { AnkiCard, AnkiCardMedia, AnkiCollectionSnapshot, AnkiDeck, AnkiDeckSnapshot, AnkiPermission, AnkiReviewRating } from './model'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Effect } from 'effect'
import { resolveAnkiCardMedia } from './media'

export interface AnkiQueryOptions {
  readonly client: AnkiConnectClient
  readonly enabled?: boolean
  readonly staleTime?: number
}

export const ankiQueryKeys = {
  all: ['anki'] as const,
  collection: () => [...ankiQueryKeys.all, 'collection'] as const,
  decks: () => [...ankiQueryKeys.all, 'decks'] as const,
  media: (cardId: number, modificationTime: number) => [...ankiQueryKeys.all, 'media', cardId, modificationTime] as const,
  permission: () => [...ankiQueryKeys.all, 'permission'] as const,
  snapshot: (deckId: number) => [...ankiQueryKeys.all, 'deck', deckId] as const,
}

function run<A>(effect: Effect.Effect<A, unknown>): Promise<A> {
  return Effect.runPromise(effect)
}

export function ankiPermissionQueryOptions({ client, enabled = true, staleTime = 5_000 }: AnkiQueryOptions): UseQueryOptions<AnkiPermission, Cause.UnknownError, AnkiPermission, QueryKey> {
  return {
    enabled,
    queryFn: () => run(client.permission()),
    queryKey: ankiQueryKeys.permission(),
    staleTime,
  }
}

export function ankiDecksQueryOptions({ client, enabled = true, staleTime = 30_000 }: AnkiQueryOptions): UseQueryOptions<readonly AnkiDeck[], Cause.UnknownError, readonly AnkiDeck[], QueryKey> {
  return {
    enabled,
    queryFn: () => run(client.decks()),
    queryKey: ankiQueryKeys.decks(),
    staleTime,
  }
}

export function ankiCollectionQueryOptions({ client, enabled = true, staleTime = 10_000 }: AnkiQueryOptions): UseQueryOptions<AnkiCollectionSnapshot, Cause.UnknownError, AnkiCollectionSnapshot, QueryKey> {
  return {
    enabled,
    queryFn: () => run(client.collectionSnapshot()),
    queryKey: ankiQueryKeys.collection(),
    staleTime,
  }
}

export function ankiDeckSnapshotQueryOptions({ client, deck, enabled = true, staleTime = 10_000 }: AnkiQueryOptions & { readonly deck: AnkiDeck }): UseQueryOptions<AnkiDeckSnapshot, Cause.UnknownError, AnkiDeckSnapshot, QueryKey> {
  return {
    enabled,
    queryFn: () => run(client.deckSnapshot(deck)),
    queryKey: ankiQueryKeys.snapshot(deck.id),
    staleTime,
  }
}

export function ankiCardMediaQueryOptions({ card, client, enabled = true, staleTime = Number.POSITIVE_INFINITY }: AnkiQueryOptions & { readonly card: AnkiCard }): UseQueryOptions<AnkiCardMedia, Cause.UnknownError, AnkiCardMedia, QueryKey> {
  return {
    enabled,
    queryFn: () => run(resolveAnkiCardMedia(client, card)),
    queryKey: ankiQueryKeys.media(card.cardId, card.mod),
    staleTime,
  }
}

export function ankiAnswerCardsMutationOptions({ client }: { readonly client: AnkiConnectClient }): UseMutationOptions<readonly boolean[], Cause.UnknownError, readonly { cardId: number, ease: AnkiReviewRating }[]> {
  return {
    mutationFn: answers => run(client.answerCards(answers)),
  }
}

export function useAnkiPermission(options: AnkiQueryOptions): UseQueryResult<AnkiPermission, Cause.UnknownError> {
  return useQuery(ankiPermissionQueryOptions(options))
}

export function useAnkiDecks(options: AnkiQueryOptions): UseQueryResult<readonly AnkiDeck[], Cause.UnknownError> {
  return useQuery(ankiDecksQueryOptions(options))
}

export function useAnkiCollection(options: AnkiQueryOptions): UseQueryResult<AnkiCollectionSnapshot, Cause.UnknownError> {
  return useQuery(ankiCollectionQueryOptions(options))
}

export function useAnkiDeckSnapshot(options: AnkiQueryOptions & { readonly deck: AnkiDeck | null }): UseQueryResult<AnkiDeckSnapshot, Cause.UnknownError> {
  return useQuery(options.deck === null
    ? {
        queryFn: async () => {
          throw new Error('Anki deck snapshot requires a selected deck')
        },
        queryKey: [...ankiQueryKeys.all, 'deck', 'none'],
        enabled: false,
      }
    : ankiDeckSnapshotQueryOptions({ ...options, deck: options.deck }))
}

export function useAnkiCardMedia(options: AnkiQueryOptions & { readonly card: AnkiCard | null }): UseQueryResult<AnkiCardMedia, Cause.UnknownError> {
  return useQuery(options.card === null
    ? {
        queryFn: async () => {
          throw new Error('Anki card media requires a selected card')
        },
        queryKey: [...ankiQueryKeys.all, 'media', 'none'],
        enabled: false,
      }
    : ankiCardMediaQueryOptions({ ...options, card: options.card }))
}

export function useAnswerAnkiCards(options: { readonly client: AnkiConnectClient }): UseMutationResult<readonly boolean[], Cause.UnknownError, readonly { cardId: number, ease: AnkiReviewRating }[]> {
  return useMutation(ankiAnswerCardsMutationOptions(options))
}

export function studyCandidates(snapshot: AnkiDeckSnapshot): readonly AnkiCard[] {
  return snapshot.queue
}
