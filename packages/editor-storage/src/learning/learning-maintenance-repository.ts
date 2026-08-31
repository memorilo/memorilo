import type { EditorStorageDatabase, EditorStorageDrizzleDatabase, StorageOperationRunner } from '../database-driver'
import type {
  LearningMaintenanceEstimate,
  LearningMaintenanceResult,
} from './types'
import { and, eq, inArray, sql } from 'drizzle-orm'
import { learningCards, learningMaintenanceState, learningOptimizers, learningReviewEvents, learningSyncOutbox, learningSyncState, learningTargets } from '../drizzle-schema'
import { createLearningMaintenancePurgePlan } from './learning-maintenance-purge-plan'

interface LearningMaintenanceRepositoryDependencies {
  database: EditorStorageDatabase
  runOperation: StorageOperationRunner
}

interface SyncStateRow {
  last_server_sequence: number
}

interface PendingMaintenanceRow {
  archived_optimizers: number
  inactive_cards: number
  review_events: number
  targets: number
}

export class LearningMaintenanceRepository {
  readonly #database: EditorStorageDatabase
  readonly #orm: EditorStorageDrizzleDatabase
  readonly #runOperation: LearningMaintenanceRepositoryDependencies['runOperation']

  constructor(dependencies: LearningMaintenanceRepositoryDependencies) {
    this.#database = dependencies.database
    this.#orm = dependencies.database.drizzle
    this.#runOperation = dependencies.runOperation
  }

  async #estimate(): Promise<LearningMaintenanceEstimate> {
    const [cards, targets, events, optimizers] = await Promise.all([
      this.#orm.select({ count: sql<number>`count(*)` }).from(learningCards).where(eq(learningCards.active, 0)).get(),
      this.#orm.select({ count: sql<number>`count(*)` }).from(learningTargets).where(eq(learningTargets.active, 0)).get(),
      this.#orm.select({ count: sql<number>`count(*)` })
        .from(learningReviewEvents)
        .where(inArray(
          learningReviewEvents.targetId,
          this.#orm.select({ targetId: learningTargets.targetId })
            .from(learningTargets)
            .where(eq(learningTargets.active, 0)),
        ))
        .get(),
      this.#orm.select({ count: sql<number>`count(*)` }).from(learningOptimizers).where(eq(learningOptimizers.status, 'archived')).get(),
    ])
    if (!cards || !targets || !events || !optimizers)
      throw new Error('Failed to count learning database maintenance scope')
    return {
      archivedOptimizers: optimizers.count,
      inactiveCards: cards.count,
      reviewEvents: events.count,
      targets: targets.count,
    }
  }

  getEstimate(): Promise<LearningMaintenanceEstimate> {
    return this.#runOperation(() => this.#estimate())
  }

  async #finishVacuum(estimate: LearningMaintenanceEstimate): Promise<LearningMaintenanceResult> {
    const foreignKeyErrors = this.#orm.all<Record<string, unknown>>(sql`PRAGMA foreign_key_check`)
    if (foreignKeyErrors.length > 0)
      throw new Error('Learning database maintenance left foreign key violations')
    await this.#database.executeInfrastructureSql('VACUUM')
    this.#orm.delete(learningMaintenanceState).where(eq(learningMaintenanceState.singleton, 1)).run()
    return { ...estimate, vacuumed: true }
  }

  async #pendingMaintenance(): Promise<LearningMaintenanceEstimate | null> {
    const row = this.#orm.select({
      archived_optimizers: learningMaintenanceState.archivedOptimizers,
      inactive_cards: learningMaintenanceState.inactiveCards,
      review_events: learningMaintenanceState.reviewEvents,
      targets: learningMaintenanceState.targets,
    }).from(learningMaintenanceState).where(and(eq(learningMaintenanceState.singleton, 1), eq(learningMaintenanceState.phase, 'vacuum-pending'))).get() as PendingMaintenanceRow | undefined
    if (!row)
      return null
    return {
      archivedOptimizers: row.archived_optimizers,
      inactiveCards: row.inactive_cards,
      reviewEvents: row.review_events,
      targets: row.targets,
    }
  }

  maintain(): Promise<LearningMaintenanceResult> {
    return this.#runOperation(async () => {
      const pendingMaintenance = await this.#pendingMaintenance()
      if (pendingMaintenance)
        return this.#finishVacuum(pendingMaintenance)

      const estimate = await this.#estimate()
      const sync = this.#orm.select({ last_server_sequence: learningSyncState.lastServerSequence })
        .from(learningSyncState)
        .where(eq(learningSyncState.singleton, 1))
        .get() as SyncStateRow | undefined
      if (!sync)
        throw new Error('Learning sync state is missing')
      const pendingChanges = this.#orm.select({ count: sql<number>`count(*)` }).from(learningSyncOutbox).get()
      if (!pendingChanges)
        throw new Error('Failed to inspect pending learning sync changes')
      if (sync.last_server_sequence > 0 && pendingChanges.count > 0)
        throw new Error('Learning database maintenance requires a clean sync')
      const inactiveCards = this.#orm.select({ card_id: learningCards.cardId }).from(learningCards).where(eq(learningCards.active, 0)).all()
      const inactiveTargets = this.#orm.select({ target_id: learningTargets.targetId }).from(learningTargets).innerJoin(learningCards, eq(learningCards.cardId, learningTargets.cardId)).where(and(eq(learningTargets.active, 0), eq(learningCards.active, 1))).all()
      const archivedOptimizers = this.#orm.select({ optimizer_id: learningOptimizers.optimizerId }).from(learningOptimizers).where(eq(learningOptimizers.status, 'archived')).all()
      const now = Date.now()
      const plan = createLearningMaintenancePurgePlan({
        archivedOptimizers,
        estimate,
        generation: sync.last_server_sequence + 1,
        inactiveCards,
        inactiveTargets,
        now,
      })
      await this.#database.batch(plan.commands)
      return this.#finishVacuum(estimate)
    })
  }
}
