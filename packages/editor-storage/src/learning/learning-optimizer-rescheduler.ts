import type { FsrsOptimizerConfiguration } from '@memorilo/srs'
import type { DatabaseCommand, EditorStorageDatabase, EditorStorageDrizzleDatabase } from '../database-driver'
import type {
  LearningReviewHistory,
  LearningReviewOptimizer,
} from './learning-review-history'
import { eq, inArray, or, sql } from 'drizzle-orm'
import { learningCards, learningNoteOptimizerAssignments, learningOptimizerRevisions, learningOptimizers, learningStates, learningTargets } from '../drizzle-schema'
import { syncMutationCommand } from './learning-storage-shared'
import { GLOBAL_OPTIMIZER_ID } from './schema'

interface OptimizerTargetRow {
  created_at: number
  note_id: string
  target_id: string
  target_kind: 'item' | 'whole'
}

interface LearningOptimizerReschedulerDependencies {
  database: Pick<EditorStorageDatabase, 'batch' | 'drizzle'>
  history: Pick<LearningReviewHistory, 'buildRescheduleCommands'>
  now?: () => number
  resolveOptimizer: (noteId: string) => Promise<LearningReviewOptimizer>
}

export class LearningOptimizerRescheduler {
  readonly #database: LearningOptimizerReschedulerDependencies['database']
  readonly #orm: EditorStorageDrizzleDatabase
  readonly #history: LearningOptimizerReschedulerDependencies['history']
  readonly #now: () => number
  readonly #resolveOptimizer: LearningOptimizerReschedulerDependencies['resolveOptimizer']

  constructor(dependencies: LearningOptimizerReschedulerDependencies) {
    this.#database = dependencies.database
    this.#orm = dependencies.database.drizzle
    this.#history = dependencies.history
    this.#now = dependencies.now ?? Date.now
    this.#resolveOptimizer = dependencies.resolveOptimizer
  }

  listTargets(optimizerId: string): Promise<readonly OptimizerTargetRow[]> {
    return Promise.resolve(this.#orm.select({
      target_id: learningTargets.targetId,
      created_at: learningTargets.createdAt,
      note_id: learningCards.noteId,
      target_kind: learningTargets.targetKind,
    }).from(learningTargets).innerJoin(learningCards, eq(learningCards.cardId, learningTargets.cardId)).leftJoin(learningNoteOptimizerAssignments, eq(learningNoteOptimizerAssignments.noteId, learningCards.noteId)).where(sql`COALESCE(${learningNoteOptimizerAssignments.optimizerId}, ${GLOBAL_OPTIMIZER_ID}) = ${optimizerId}`).all() as OptimizerTargetRow[])
  }

  async commandsForRevision(
    optimizerId: string,
    revisionId: string,
    configuration: FsrsOptimizerConfiguration,
  ): Promise<readonly DatabaseCommand[]> {
    const commands: DatabaseCommand[] = []
    for (const target of await this.listTargets(optimizerId)) {
      commands.push(...await this.#history.buildRescheduleCommands({
        createdAt: target.created_at,
        targetId: target.target_id,
        targetKind: target.target_kind,
      }, { configuration, revisionId }))
    }
    return commands
  }

  async archive(optimizerId: string, global: LearningReviewOptimizer): Promise<void> {
    const noteRows = this.#orm.select({ note_id: learningNoteOptimizerAssignments.noteId })
      .from(learningNoteOptimizerAssignments)
      .where(eq(learningNoteOptimizerAssignments.optimizerId, optimizerId))
      .all() as Array<{ note_id: string }>
    const assignedNoteIds = new Set(noteRows.map(row => row.note_id))
    const targets = this.#orm.select({
      target_id: learningTargets.targetId,
      created_at: learningTargets.createdAt,
      note_id: learningCards.noteId,
      target_kind: learningTargets.targetKind,
    }).from(learningTargets).innerJoin(learningCards, eq(learningCards.cardId, learningTargets.cardId)).innerJoin(learningStates, eq(learningStates.targetId, learningTargets.targetId)).where(or(
      inArray(learningCards.noteId, noteRows.map(row => row.note_id)),
      inArray(learningStates.optimizerRevisionId, this.#orm.select({ id: learningOptimizerRevisions.revisionId }).from(learningOptimizerRevisions).where(eq(learningOptimizerRevisions.optimizerId, optimizerId))),
    )).all() as OptimizerTargetRow[]
    const commands: DatabaseCommand[] = []
    for (const target of targets) {
      const destination = assignedNoteIds.has(target.note_id)
        ? global
        : await this.#resolveOptimizer(target.note_id)
      commands.push(...await this.#history.buildRescheduleCommands({
        createdAt: target.created_at,
        targetId: target.target_id,
        targetKind: target.target_kind,
      }, destination))
    }

    const now = this.#now()
    commands.push(
      {
        drizzle: database => database.update(learningOptimizers).set({
          status: 'archived',
          syncSequence: -1,
          updatedAt: now,
        }).where(eq(learningOptimizers.optimizerId, optimizerId)).run(),
      },
      {
        drizzle: database => database.update(learningNoteOptimizerAssignments).set({
          optimizerId: GLOBAL_OPTIMIZER_ID,
          syncSequence: -1,
          updatedAt: now,
        }).where(eq(learningNoteOptimizerAssignments.optimizerId, optimizerId)).run(),
      },
      syncMutationCommand('optimizer', optimizerId, 'upsert', {
        id: optimizerId,
        status: 'archived',
      }, now),
    )
    for (const note of noteRows) {
      commands.push(syncMutationCommand('assignment', note.note_id, 'upsert', {
        noteId: note.note_id,
        optimizerId: GLOBAL_OPTIMIZER_ID,
      }, now))
    }
    await this.#database.batch(commands)
  }
}
