import type { FsrsOptimizerConfiguration } from '@memorilo/srs'
import type { DatabaseCommand, EditorStorageDatabase } from '../database-driver'
import type {
  LearningReviewHistory,
  LearningReviewOptimizer,
} from './learning-review-history'
import { syncMutationCommand } from './learning-storage-shared'
import { GLOBAL_OPTIMIZER_ID } from './schema'

interface OptimizerTargetRow {
  created_at: number
  note_id: string
  target_id: string
  target_kind: 'item' | 'whole'
}

interface LearningOptimizerReschedulerDependencies {
  database: Pick<EditorStorageDatabase, 'all' | 'batch'>
  history: Pick<LearningReviewHistory, 'buildRescheduleCommands'>
  now?: () => number
  resolveOptimizer: (noteId: string) => Promise<LearningReviewOptimizer>
}

export class LearningOptimizerRescheduler {
  readonly #database: LearningOptimizerReschedulerDependencies['database']
  readonly #history: LearningOptimizerReschedulerDependencies['history']
  readonly #now: () => number
  readonly #resolveOptimizer: LearningOptimizerReschedulerDependencies['resolveOptimizer']

  constructor(dependencies: LearningOptimizerReschedulerDependencies) {
    this.#database = dependencies.database
    this.#history = dependencies.history
    this.#now = dependencies.now ?? Date.now
    this.#resolveOptimizer = dependencies.resolveOptimizer
  }

  listTargets(optimizerId: string): Promise<readonly OptimizerTargetRow[]> {
    return this.#database.all<OptimizerTargetRow>(
      'SELECT t.target_id, t.created_at, c.note_id, t.target_kind FROM learning_targets t JOIN learning_cards c ON c.card_id = t.card_id LEFT JOIN learning_note_optimizer_assignments a ON a.note_id = c.note_id WHERE COALESCE(a.optimizer_id, ?) = ?',
      [GLOBAL_OPTIMIZER_ID, optimizerId],
    )
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
    const noteRows = await this.#database.all<{ note_id: string }>(
      'SELECT note_id FROM learning_note_optimizer_assignments WHERE optimizer_id = ?',
      [optimizerId],
    )
    const assignedNoteIds = new Set(noteRows.map(row => row.note_id))
    const targets = await this.#database.all<OptimizerTargetRow>(
      'SELECT t.target_id, t.created_at, c.note_id, t.target_kind FROM learning_targets t JOIN learning_cards c ON c.card_id = t.card_id JOIN learning_states s ON s.target_id = t.target_id WHERE c.note_id IN (SELECT note_id FROM learning_note_optimizer_assignments WHERE optimizer_id = ?) OR s.optimizer_revision_id IN (SELECT revision_id FROM learning_optimizer_revisions WHERE optimizer_id = ?)',
      [optimizerId, optimizerId],
    )
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
        parameters: [now, optimizerId],
        sql: 'UPDATE learning_optimizers SET status = \'archived\', updated_at = ?, sync_sequence = -1 WHERE optimizer_id = ?',
      },
      {
        parameters: [GLOBAL_OPTIMIZER_ID, now, optimizerId],
        sql: 'UPDATE learning_note_optimizer_assignments SET optimizer_id = ?, updated_at = ?, sync_sequence = -1 WHERE optimizer_id = ?',
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
