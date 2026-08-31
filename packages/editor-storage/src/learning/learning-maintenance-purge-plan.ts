import type { DatabaseCommand } from '../database-driver'
import type { LearningMaintenanceEstimate } from './types'
import { eq } from 'drizzle-orm'
import { v7 as createUuidV7 } from 'uuid'
import { learningCards, learningMaintenanceState, learningOptimizers, learningPurgeTombstones, learningTargets } from '../drizzle-schema'
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
      drizzle: database => database.insert(learningPurgeTombstones).values({
        createdAt: now,
        generation,
        scopeId,
        scopeKind,
        tombstoneId,
      }).run(),
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
    { drizzle: database => database.delete(learningTargets).where(eq(learningTargets.active, 0)).run() },
    { drizzle: database => database.delete(learningCards).where(eq(learningCards.active, 0)).run() },
    { drizzle: database => database.delete(learningOptimizers).where(eq(learningOptimizers.status, 'archived')).run() },
    {
      drizzle: database => database.insert(learningMaintenanceState).values({
        archivedOptimizers: input.estimate.archivedOptimizers,
        createdAt: input.now,
        inactiveCards: input.estimate.inactiveCards,
        phase: 'vacuum-pending',
        reviewEvents: input.estimate.reviewEvents,
        singleton: 1,
        targets: input.estimate.targets,
      }).run(),
    },
  )
  return { commands }
}
