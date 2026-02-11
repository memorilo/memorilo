import type { Channel } from '../channel'
import type { ApiError } from './common'
import type { CommandError } from './shared'
import { Effect } from 'effect'

export interface CreatedTopic {
  docId: string
  topicUuid: string
}

export type StateVector = number[]

export interface DocHandlers {
  getDoc: (docId: string) => Effect.Effect<number[], CommandError<ApiError | Error>>
  getDocTitle: (docId: string) => Effect.Effect<string, CommandError<ApiError | Error>>
  getDocVersion: (docId: string) => Effect.Effect<StateVector, CommandError<ApiError | Error>>
  updateDoc: (docId: string, update: number[]) => Effect.Effect<null, CommandError<ApiError | Error>>
  updateTopicDoc: (docId: string, update: number[]) => Effect.Effect<null, CommandError<ApiError | Error>>
  createDoc: () => Effect.Effect<string, CommandError<ApiError | Error>>
  updateDocTitle: (docId: string, title: string) => Effect.Effect<null, CommandError<ApiError | Error>>
  deleteDoc: (docId: string) => Effect.Effect<null, CommandError<ApiError | Error>>
  createTopic: (parentUuid: string, name: string) => Effect.Effect<CreatedTopic, CommandError<ApiError | Error>>
  watchDoc: (docId: string, channel: Channel<number[]>) => Effect.Effect<string, CommandError<ApiError | Error>>
  unwatchDoc: (watchId: string) => Effect.Effect<null, CommandError<ApiError | Error>>
}

export class DocService extends Effect.Tag('DocService')<DocService, DocHandlers>() {}
