import type { Channel } from '../channel'
import type { ApiError } from './common'
import type { CommandError } from './shared'
import { Effect } from 'effect'

export interface CreatedTopic {
  docId: string
  topicUuid: string
}

export type StateVector = number[]

export interface EffectDocCommands {
  getDoc: (docId: string) => Effect.Effect<number[], CommandError<ApiError>>
  getDocTitle: (docId: string) => Effect.Effect<string, CommandError<ApiError>>
  getDocVersion: (docId: string) => Effect.Effect<StateVector, CommandError<ApiError>>
  updateDoc: (docId: string, update: number[]) => Effect.Effect<null, CommandError<ApiError>>
  updateTopicDoc: (docId: string, update: number[]) => Effect.Effect<null, CommandError<ApiError>>
  createDoc: () => Effect.Effect<string, CommandError<ApiError>>
  updateDocTitle: (docId: string, title: string) => Effect.Effect<null, CommandError<ApiError>>
  deleteDoc: (docId: string) => Effect.Effect<null, CommandError<ApiError>>
  createTopic: (parentUuid: string, name: string) => Effect.Effect<CreatedTopic, CommandError<ApiError>>
  watchDoc: (docId: string, channel: Channel<number[]>) => Effect.Effect<string, CommandError<ApiError>>
  unwatchDoc: (watchId: string) => Effect.Effect<null, CommandError<ApiError>>
}

export class DocService extends Effect.Tag('DocService')<DocService, EffectDocCommands>() {}
