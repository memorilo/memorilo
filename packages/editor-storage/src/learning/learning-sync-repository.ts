import type { DatabaseCommand, EditorStorageDatabase, EditorStorageDrizzleDatabase, StorageOperationRunner } from '../database-driver'
import type {
  AcknowledgeLearningSyncInput,
  ApplyLearningSyncChangeInput,
  LearningSyncChange,
} from './types'
import { and, asc, eq, inArray, sql } from 'drizzle-orm'
import {
  learningCards,
  learningNoteOptimizerAssignments,
  learningOptimizerRevisions,
  learningOptimizers,
  learningPurgeTombstones,
  learningReviewEvents,
  learningStates,
  learningSyncOutbox,
  learningSyncReceivedMutations,
  learningSyncState,
  learningTargets,
} from '../drizzle-schema'
import { assertNonEmpty } from './learning-storage-shared'

interface LearningSyncRepositoryDependencies {
  database: EditorStorageDatabase
  runOperation: StorageOperationRunner
}

export class LearningSyncRepository {
  readonly #database: EditorStorageDatabase
  readonly #orm: EditorStorageDrizzleDatabase
  readonly #runOperation: LearningSyncRepositoryDependencies['runOperation']

  constructor(dependencies: LearningSyncRepositoryDependencies) {
    this.#database = dependencies.database
    this.#orm = dependencies.database.drizzle
    this.#runOperation = dependencies.runOperation
  }

  listPending(limit = 250): Promise<readonly LearningSyncChange[]> {
    if (!Number.isSafeInteger(limit) || limit < 1)
      throw new RangeError('Learning sync change limit must be a positive safe integer')
    return this.#runOperation(async () => {
      const rows = this.#orm.select({
        created_at: learningSyncOutbox.createdAt,
        entity_id: learningSyncOutbox.entityId,
        entity_kind: learningSyncOutbox.entityKind,
        mutation_id: learningSyncOutbox.mutationId,
        operation: learningSyncOutbox.operation,
        payload_json: learningSyncOutbox.payloadJson,
      }).from(learningSyncOutbox).orderBy(asc(learningSyncOutbox.createdAt), asc(learningSyncOutbox.mutationId)).limit(limit).all() as Array<{
        created_at: number
        entity_id: string
        entity_kind: LearningSyncChange['entityKind']
        mutation_id: string
        operation: LearningSyncChange['operation']
        payload_json: string
      }>
      return rows.map(row => ({
        createdAt: row.created_at,
        entityId: row.entity_id,
        entityKind: row.entity_kind,
        mutationId: row.mutation_id,
        operation: row.operation,
        payload: JSON.parse(row.payload_json) as unknown,
      }))
    })
  }

  applyRemote(input: ApplyLearningSyncChangeInput): Promise<void> {
    if (!input.mutationId || !input.sourceDeviceId)
      throw new TypeError('Remote learning mutation identity is required')
    if (!Number.isSafeInteger(input.sourceSequence) || input.sourceSequence < 1)
      throw new RangeError('Remote learning mutation sequence must be positive')
    return this.#runOperation(async () => {
      const received = this.#orm.select({ mutation_id: learningSyncReceivedMutations.mutationId }).from(learningSyncReceivedMutations).where(eq(learningSyncReceivedMutations.mutationId, input.mutationId)).get()
      if (received)
        return
      const payload = input.payload && typeof input.payload === 'object'
        ? input.payload as Record<string, unknown>
        : {}
      const now = Number.isSafeInteger(input.createdAt) && input.createdAt >= 0 ? input.createdAt : Date.now()
      const commands: DatabaseCommand[] = []
      if (input.entityKind === 'tombstone' && input.operation === 'delete') {
        const tombstone = parseTombstone(payload, input.entityId)
        const existingTombstone = this.#orm.select({ generation: learningPurgeTombstones.generation }).from(learningPurgeTombstones).where(and(eq(learningPurgeTombstones.scopeKind, tombstone.scopeKind), eq(learningPurgeTombstones.scopeId, tombstone.scopeId))).get()
        if (!existingTombstone || existingTombstone.generation < tombstone.generation) {
          commands.push({
            drizzle: database => database.delete(learningPurgeTombstones).where(and(
              eq(learningPurgeTombstones.scopeKind, tombstone.scopeKind),
              eq(learningPurgeTombstones.scopeId, tombstone.scopeId),
            )).run(),
          }, {
            drizzle: database => database.insert(learningPurgeTombstones).values({
              createdAt: now,
              generation: tombstone.generation,
              scopeId: tombstone.scopeId,
              scopeKind: tombstone.scopeKind,
              tombstoneId: tombstone.tombstoneId,
            }).run(),
          })
          if (tombstone.scopeKind === 'target') {
            commands.push({
              drizzle: database => database.delete(learningTargets)
                .where(eq(learningTargets.targetId, tombstone.scopeId))
                .run(),
            })
          }
          else if (tombstone.scopeKind === 'card') {
            commands.push({
              drizzle: database => database.delete(learningCards)
                .where(eq(learningCards.cardId, tombstone.scopeId))
                .run(),
            })
          }
          else {
            commands.push(
              {
                drizzle: database => database.delete(learningNoteOptimizerAssignments)
                  .where(eq(learningNoteOptimizerAssignments.optimizerId, tombstone.scopeId))
                  .run(),
              },
              {
                drizzle: database => database.delete(learningStates).where(inArray(
                  learningStates.optimizerRevisionId,
                  database.select({ id: learningOptimizerRevisions.revisionId })
                    .from(learningOptimizerRevisions)
                    .where(eq(learningOptimizerRevisions.optimizerId, tombstone.scopeId)),
                )).run(),
              },
              {
                drizzle: database => database.delete(learningOptimizerRevisions)
                  .where(eq(learningOptimizerRevisions.optimizerId, tombstone.scopeId))
                  .run(),
              },
              {
                drizzle: database => database.delete(learningOptimizers)
                  .where(eq(learningOptimizers.optimizerId, tombstone.scopeId))
                  .run(),
              },
            )
          }
        }
      }
      else if (input.operation === 'upsert') {
        const tombstoneScope = tombstoneScopeFor(input, payload)
        if (tombstoneScope !== null) {
          const tombstone = this.#orm.select({ generation: learningPurgeTombstones.generation }).from(learningPurgeTombstones).where(and(eq(learningPurgeTombstones.scopeKind, tombstoneScope.scopeKind), eq(learningPurgeTombstones.scopeId, tombstoneScope.scopeId))).get()
          const incomingGeneration = Number.isSafeInteger(payload.generation) && (payload.generation as number) > 0
            ? payload.generation as number
            : 0
          if (tombstone && tombstone.generation >= incomingGeneration)
            return this.#recordReceived(input, now)
        }
        switch (input.entityKind) {
          case 'assignment': {
            const noteId = stringPayload(payload, 'noteId', input.entityId)
            const optimizerId = stringPayload(payload, 'optimizerId')
            commands.push({
              drizzle: database => database.insert(learningNoteOptimizerAssignments).values({
                noteId,
                optimizerId,
                updatedAt: now,
              }).onConflictDoUpdate({
                set: { optimizerId, updatedAt: now },
                target: learningNoteOptimizerAssignments.noteId,
              }).run(),
            })
            break
          }
          case 'optimizer': {
            const optimizerId = stringPayload(payload, 'id', input.entityId)
            const name = stringPayload(payload, 'name', optimizerId)
            const status = payload.status === 'archived' ? 'archived' : 'active'
            const revisionId = stringPayload(payload, 'revisionId', `${optimizerId}:remote`)
            const configuration = payload.configuration && typeof payload.configuration === 'object'
              ? JSON.stringify(payload.configuration)
              : '{}'
            commands.push(
              {
                drizzle: database => database.insert(learningOptimizers).values({
                  createdAt: now,
                  currentRevisionId: revisionId,
                  isGlobal: 0,
                  name,
                  optimizerId,
                  status,
                  updatedAt: now,
                }).onConflictDoUpdate({
                  set: { currentRevisionId: revisionId, name, status, updatedAt: now },
                  target: learningOptimizers.optimizerId,
                }).run(),
              },
              {
                drizzle: database => database.insert(learningOptimizerRevisions).values({
                  configurationJson: configuration,
                  createdAt: now,
                  fsrsVersion: 'remote',
                  optimizerId,
                  revisionId,
                }).onConflictDoNothing().run(),
              },
            )
            break
          }
          case 'card': {
            const cardId = stringPayload(payload, 'cardId', input.entityId)
            const noteId = stringPayload(payload, 'noteId')
            const topicId = stringPayload(payload, 'topicId')
            const sourceBlockId = stringPayload(payload, 'sourceBlockId')
            const kind = stringPayload(payload, 'kind', 'basic')
            const direction = stringPayload(payload, 'direction', 'forward')
            const topicOrder = integerPayload(payload, 'topicOrder')
            const sourceOrder = integerPayload(payload, 'sourceOrder')
            const itemBlockIds = Array.isArray(payload.itemBlockIds) ? payload.itemBlockIds : []
            commands.push({
              drizzle: database => database.insert(learningCards).values({
                active: 1,
                cardId,
                direction,
                firstSeenAt: now,
                inactiveAt: null,
                kind,
                lastSeenAt: now,
                noteId,
                sourceBlockId,
                sourceOrder,
                topicId,
                topicOrder,
              }).onConflictDoUpdate({
                set: {
                  active: 1,
                  direction,
                  inactiveAt: null,
                  kind,
                  lastSeenAt: now,
                  noteId,
                  sourceBlockId,
                  sourceOrder,
                  topicId,
                  topicOrder,
                },
                target: learningCards.cardId,
              }).run(),
            })
            for (const [targetOrder, itemBlockId] of itemBlockIds.entries()) {
              if (typeof itemBlockId !== 'string')
                continue
              const targetId = `${cardId}:${itemBlockId}`
              commands.push({
                drizzle: database => database.insert(learningTargets).values({
                  active: 1,
                  cardId,
                  createdAt: now,
                  inactiveAt: null,
                  itemBlockId,
                  targetId,
                  targetKind: 'item',
                  targetOrder,
                }).onConflictDoUpdate({
                  set: { active: 1, inactiveAt: null, targetOrder },
                  target: learningTargets.targetId,
                }).run(),
              })
            }
            break
          }
          case 'review-event': {
            const targetId = stringPayload(payload, 'targetId')
            const eventId = stringPayload(payload, 'eventId', input.entityId)
            const kind = stringPayload(payload, 'kind')
            const occurredAt = integerPayload(payload, kind === 'reset' ? 'resetAt' : kind === 'undo' ? 'undoneAt' : 'reviewedAt')
            if (kind !== 'rating' && kind !== 'reset' && kind !== 'undo')
              throw new TypeError('Unsupported remote review event kind')
            const resultState = payload.resultState && typeof payload.resultState === 'object'
              ? payload.resultState as Record<string, unknown>
              : null
            const cardId = stringPayload(payload, 'cardId', targetId)
            const noteId = stringPayload(payload, 'noteId', targetId)
            const rating = kind === 'rating' ? stringPayload(payload, 'rating') : null
            const undoesEventId = kind === 'undo' ? stringPayload(payload, 'undoesEventId') : null
            commands.push({
              drizzle: database => database.insert(learningReviewEvents).values({
                cardId,
                deviceId: input.sourceDeviceId,
                deviceSequence: input.sourceSequence,
                eventId,
                eventKind: kind,
                fsrsVersion: 'remote',
                noteId,
                occurredAt,
                rating,
                resetEpoch: kind === 'reset' ? String(occurredAt) : null,
                resultStateJson: JSON.stringify(resultState),
                targetId,
                undoesEventId,
              }).onConflictDoNothing().run(),
            })
            if (resultState !== null) {
              const state = {
                difficulty: stateValue(resultState, 'difficulty') as number,
                dueAt: stateValue(resultState, 'dueAt') as number,
                lapses: stateValue(resultState, 'lapses') as number,
                lastReviewAt: stateValue(resultState, 'lastReviewAt') as number | null,
                learningSteps: stateValue(resultState, 'learningSteps') as number,
                optimizerRevisionId: stateValue(resultState, 'optimizerRevisionId') as string,
                phase: stateValue(resultState, 'phase') as string,
                reps: stateValue(resultState, 'reps') as number,
                scheduledDays: stateValue(resultState, 'scheduledDays') as number,
                stability: stateValue(resultState, 'stability') as number,
                stateHash: stateValue(resultState, 'stateHash') as string,
                winningEventId: stateValue(resultState, 'winningEventId') as string | null,
              }
              commands.push({
                drizzle: database => database.update(learningStates).set(state).where(eq(learningStates.targetId, targetId)).run(),
              })
            }
            break
          }
          case 'tombstone':
            break
        }
      }
      commands.push({
        drizzle: database => database.insert(learningSyncReceivedMutations).values({
          mutationId: input.mutationId,
          receivedAt: now,
          sourceDeviceId: input.sourceDeviceId,
          sourceSequence: input.sourceSequence,
        }).run(),
      })
      await this.#database.batch(commands)
    })
  }

  #recordReceived(input: ApplyLearningSyncChangeInput, receivedAt: number): Promise<void> {
    this.#orm.insert(learningSyncReceivedMutations).values({
      mutationId: input.mutationId,
      receivedAt,
      sourceDeviceId: input.sourceDeviceId,
      sourceSequence: input.sourceSequence,
    }).run()
    return Promise.resolve()
  }

  acknowledge(input: AcknowledgeLearningSyncInput): Promise<void> {
    if (!Number.isSafeInteger(input.serverSequence) || input.serverSequence < 0)
      throw new RangeError('Server sequence must be a non-negative safe integer')
    const mutationIds = [...new Set(input.mutationIds)]
    mutationIds.forEach(mutationId => assertNonEmpty(mutationId, 'Sync mutation id'))
    return this.#runOperation(async () => {
      const commands: DatabaseCommand[] = []
      if (mutationIds.length > 0) {
        const existing = this.#orm.select({ count: sql<number>`count(*)` }).from(learningSyncOutbox).where(inArray(learningSyncOutbox.mutationId, mutationIds)).get()
        if (!existing || existing.count !== mutationIds.length)
          throw new Error('Cannot acknowledge unknown learning sync mutations')
        commands.push({
          drizzle: database => database.delete(learningSyncOutbox)
            .where(inArray(learningSyncOutbox.mutationId, mutationIds))
            .run(),
        })
      }
      commands.push({
        drizzle: database => database.update(learningSyncState)
          .set({ lastServerSequence: sql`MAX(${learningSyncState.lastServerSequence}, ${input.serverSequence})` })
          .where(eq(learningSyncState.singleton, 1))
          .run(),
      })
      await this.#database.batch(commands)
    })
  }

  acknowledgeMutations(mutationIds: readonly string[]): Promise<void> {
    const uniqueMutationIds = [...new Set(mutationIds)]
    uniqueMutationIds.forEach(mutationId => assertNonEmpty(mutationId, 'Sync mutation id'))
    return this.#runOperation(async () => {
      if (uniqueMutationIds.length === 0)
        return
      const existing = this.#orm.select({ count: sql<number>`count(*)` }).from(learningSyncOutbox).where(inArray(learningSyncOutbox.mutationId, uniqueMutationIds)).get()
      if (!existing || existing.count !== uniqueMutationIds.length)
        throw new Error('Cannot acknowledge unknown learning sync mutations')
      this.#orm.delete(learningSyncOutbox).where(inArray(learningSyncOutbox.mutationId, uniqueMutationIds)).run()
    })
  }
}

type TombstoneScopeKind = 'card' | 'optimizer' | 'target'

interface TombstonePayload {
  readonly generation: number
  readonly scopeId: string
  readonly scopeKind: TombstoneScopeKind
  readonly tombstoneId: string
}

function parseTombstone(payload: Record<string, unknown>, fallbackId: string): TombstonePayload {
  const scopeKind = payload.scopeKind
  const scopeId = payload.scopeId
  const generation = payload.generation
  const tombstoneId = payload.tombstoneId
  if ((scopeKind !== 'card' && scopeKind !== 'optimizer' && scopeKind !== 'target')
    || typeof scopeId !== 'string' || scopeId.length === 0
    || !Number.isSafeInteger(generation) || (generation as number) < 1
    || (typeof tombstoneId !== 'string' && (typeof fallbackId !== 'string' || fallbackId.length === 0))) {
    throw new TypeError('Remote learning tombstone payload is invalid')
  }
  return {
    generation: generation as number,
    scopeId,
    scopeKind,
    tombstoneId: typeof tombstoneId === 'string' && tombstoneId.length > 0 ? tombstoneId : fallbackId,
  }
}

function tombstoneScopeFor(
  input: ApplyLearningSyncChangeInput,
  payload: Record<string, unknown>,
): { scopeId: string, scopeKind: TombstoneScopeKind } | null {
  if (input.entityKind === 'card')
    return { scopeId: stringPayload(payload, 'cardId', input.entityId), scopeKind: 'card' }
  if (input.entityKind === 'optimizer')
    return { scopeId: stringPayload(payload, 'id', input.entityId), scopeKind: 'optimizer' }
  if (input.entityKind === 'review-event' && typeof payload.targetId === 'string')
    return { scopeId: payload.targetId, scopeKind: 'target' }
  return null
}

function stringPayload(payload: Record<string, unknown>, key: string, fallback?: string): string {
  const value = payload[key]
  if (typeof value === 'string' && value.length > 0)
    return value
  if (fallback !== undefined && fallback.length > 0)
    return fallback
  throw new TypeError(`Remote learning payload field ${key} is required`)
}

function integerPayload(payload: Record<string, unknown>, key: string): number {
  const value = payload[key]
  if (!Number.isSafeInteger(value) || (value as number) < 0)
    throw new TypeError(`Remote learning payload field ${key} must be a non-negative integer`)
  return value as number
}

function stateValue(payload: Record<string, unknown>, key: string): string | number | null {
  const value = payload[key]
  if (value === null || typeof value === 'string' || typeof value === 'number')
    return value
  throw new TypeError(`Remote learning state field ${key} is invalid`)
}
