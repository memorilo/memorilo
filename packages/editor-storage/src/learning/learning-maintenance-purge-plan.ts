import type { DatabaseCommand } from '../database-driver'
import type { LearningMaintenanceEstimate } from './types'
import { v7 as createUuidV7 } from 'uuid'
import { syncMutationCommand } from './learning-storage-shared'

type PurgeScopeKind = 'card' | 'optimizer' | 'target'

interface LearningMaintenancePurgePlanInput {
  archivedOptimizers: readonly { optimizer_id: string }[]
  estimate: LearningMaintenanceEstimate
  generation: number
  inactiveCards: readonly { card_id: string }[]
  inactiveTargets: readonly { target_id: string }[]
  now: number
}

export interface LearningMaintenancePurgePlan {
  commands: readonly DatabaseCommand[]
}

function appendTombstone(
  commands: DatabaseCommand[],
  scopeKind: PurgeScopeKind,
  scopeId: string,
  generation: number,
  now: number,
): void {
  const tombstoneId = createUuidV7()
  commands.push(
    {
      parameters: [tombstoneId, scopeKind, scopeId, generation, now],
      sql: 'INSERT INTO learning_purge_tombstones (tombstone_id, scope_kind, scope_id, generation, created_at) VALUES (?, ?, ?, ?, ?)',
    },
    syncMutationCommand('tombstone', tombstoneId, 'delete', {
      generation,
      scopeId,
      scopeKind,
      tombstoneId,
    }, now),
  )
}

/**
 * Turns a stable maintenance scope into one atomic purge transaction. The
 * repository owns when this plan is executed; this module owns the ordering
 * and the fact that every destructive scope publishes a tombstone first.
 */
export function createLearningMaintenancePurgePlan(
  input: LearningMaintenancePurgePlanInput,
): LearningMaintenancePurgePlan {
  const commands: DatabaseCommand[] = []
  for (const card of input.inactiveCards)
    appendTombstone(commands, 'card', card.card_id, input.generation, input.now)
  for (const optimizer of input.archivedOptimizers)
    appendTombstone(commands, 'optimizer', optimizer.optimizer_id, input.generation, input.now)
  for (const target of input.inactiveTargets)
    appendTombstone(commands, 'target', target.target_id, input.generation, input.now)

  commands.push(
    { sql: 'DELETE FROM learning_targets WHERE active = 0' },
    { sql: 'DELETE FROM learning_cards WHERE active = 0' },
    { sql: 'DELETE FROM learning_optimizers WHERE status = \'archived\'' },
    {
      parameters: [
        input.estimate.archivedOptimizers,
        input.estimate.inactiveCards,
        input.estimate.reviewEvents,
        input.estimate.targets,
        input.now,
      ],
      sql: 'INSERT INTO learning_maintenance_state (singleton, phase, archived_optimizers, inactive_cards, review_events, targets, created_at) VALUES (1, \'vacuum-pending\', ?, ?, ?, ?, ?)',
    },
  )
  return { commands }
}
