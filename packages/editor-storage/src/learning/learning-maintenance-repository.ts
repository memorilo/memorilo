import type { EditorStorageDatabase, StorageOperationRunner } from '../database-driver'
import type {
  LearningMaintenanceEstimate,
  LearningMaintenanceResult,
} from './types'
import { createLearningMaintenancePurgePlan } from './learning-maintenance-purge-plan'

interface LearningMaintenanceRepositoryDependencies {
  database: EditorStorageDatabase
  runOperation: StorageOperationRunner
}

interface CountRow {
  count: number
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
  readonly #runOperation: LearningMaintenanceRepositoryDependencies['runOperation']

  constructor(dependencies: LearningMaintenanceRepositoryDependencies) {
    this.#database = dependencies.database
    this.#runOperation = dependencies.runOperation
  }

  async #estimate(): Promise<LearningMaintenanceEstimate> {
    const [cards, targets, events, optimizers] = await Promise.all([
      this.#database.get<CountRow>('SELECT COUNT(*) AS count FROM learning_cards WHERE active = 0'),
      this.#database.get<CountRow>('SELECT COUNT(*) AS count FROM learning_targets WHERE active = 0'),
      this.#database.get<CountRow>('SELECT COUNT(*) AS count FROM learning_review_events WHERE target_id IN (SELECT target_id FROM learning_targets WHERE active = 0)'),
      this.#database.get<CountRow>('SELECT COUNT(*) AS count FROM learning_optimizers WHERE status = \'archived\''),
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
    const foreignKeyErrors = await this.#database.all<Record<string, unknown>>(
      'PRAGMA foreign_key_check',
    )
    if (foreignKeyErrors.length > 0)
      throw new Error('Learning database maintenance left foreign key violations')
    await this.#database.exec('VACUUM')
    await this.#database.run('DELETE FROM learning_maintenance_state WHERE singleton = 1')
    return { ...estimate, vacuumed: true }
  }

  async #pendingMaintenance(): Promise<LearningMaintenanceEstimate | null> {
    const row = await this.#database.get<PendingMaintenanceRow>(
      'SELECT archived_optimizers, inactive_cards, review_events, targets FROM learning_maintenance_state WHERE singleton = 1 AND phase = \'vacuum-pending\'',
    )
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
      const sync = await this.#database.get<SyncStateRow>(
        'SELECT last_server_sequence FROM learning_sync_state WHERE singleton = 1',
      )
      if (!sync)
        throw new Error('Learning sync state is missing')
      const pendingChanges = await this.#database.get<CountRow>(
        'SELECT COUNT(*) AS count FROM learning_sync_outbox',
      )
      if (!pendingChanges)
        throw new Error('Failed to inspect pending learning sync changes')
      if (sync.last_server_sequence > 0 && pendingChanges.count > 0)
        throw new Error('Learning database maintenance requires a clean sync')
      const inactiveCards = await this.#database.all<{ card_id: string }>(
        'SELECT card_id FROM learning_cards WHERE active = 0',
      )
      const inactiveTargets = await this.#database.all<{ target_id: string }>(
        'SELECT t.target_id FROM learning_targets t JOIN learning_cards c ON c.card_id = t.card_id WHERE t.active = 0 AND c.active = 1',
      )
      const archivedOptimizers = await this.#database.all<{ optimizer_id: string }>(
        'SELECT optimizer_id FROM learning_optimizers WHERE status = \'archived\'',
      )
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
