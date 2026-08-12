import type { EditorStorageDatabase } from '../database-driver'
import type { LearningReviewOptimizer } from './learning-review-history'
import type { FsrsOptimizer } from './types'
import { assertNonEmpty, parseOptimizerConfiguration } from './learning-storage-shared'
import { GLOBAL_OPTIMIZER_ID } from './schema'

interface OptimizerRow {
  configuration_json: string
  created_at: number
  current_revision_id: string
  is_global: number
  name: string
  optimizer_id: string
  status: 'active' | 'archived'
  updated_at: number
}

interface EffectiveOptimizerRow extends OptimizerRow {
  note_id: string
}

interface CountRow {
  count: number
}

export interface EffectiveLearningOptimizer extends LearningReviewOptimizer {
  createdAt: number
  id: string
  isGlobal: boolean
  name: string
  status: 'active' | 'archived'
  updatedAt: number
}

function toOptimizer(row: OptimizerRow): FsrsOptimizer {
  return {
    configuration: parseOptimizerConfiguration(row.configuration_json),
    createdAt: row.created_at,
    id: row.optimizer_id,
    isGlobal: row.is_global === 1,
    name: row.name,
    revisionId: row.current_revision_id,
    status: row.status,
    updatedAt: row.updated_at,
  }
}

export class LearningOptimizerCatalog {
  readonly #database: EditorStorageDatabase

  constructor(database: EditorStorageDatabase) {
    this.#database = database
  }

  async #optimizerRow(optimizerId: string): Promise<OptimizerRow> {
    const row = await this.#database.get<OptimizerRow>(
      'SELECT o.optimizer_id, o.name, o.is_global, o.status, o.current_revision_id, o.created_at, o.updated_at, r.configuration_json FROM learning_optimizers o JOIN learning_optimizer_revisions r ON r.revision_id = o.current_revision_id WHERE o.optimizer_id = ?',
      [optimizerId],
    )
    if (!row)
      throw new Error(`Unknown FSRS Optimizer: ${optimizerId}`)
    return row
  }

  async effective(noteId: string): Promise<EffectiveLearningOptimizer> {
    assertNonEmpty(noteId, 'Note id')
    const row = await this.#database.get<EffectiveOptimizerRow>(
      'SELECT ? AS note_id, o.optimizer_id, o.name, o.is_global, o.status, o.current_revision_id, o.created_at, o.updated_at, r.configuration_json FROM learning_optimizers o JOIN learning_optimizer_revisions r ON r.revision_id = o.current_revision_id WHERE o.optimizer_id = COALESCE((SELECT optimizer_id FROM learning_note_optimizer_assignments WHERE note_id = ?), ?)',
      [noteId, noteId, GLOBAL_OPTIMIZER_ID],
    )
    if (!row)
      throw new Error(`Note ${noteId} has no effective FSRS Optimizer`)
    if (row.status !== 'active')
      throw new Error(`Note ${noteId} references archived FSRS Optimizer ${row.optimizer_id}`)
    return {
      configuration: parseOptimizerConfiguration(row.configuration_json),
      createdAt: row.created_at,
      id: row.optimizer_id,
      isGlobal: row.is_global === 1,
      name: row.name,
      revisionId: row.current_revision_id,
      status: row.status,
      updatedAt: row.updated_at,
    }
  }

  async get(optimizerId: string): Promise<FsrsOptimizer> {
    assertNonEmpty(optimizerId, 'FSRS Optimizer id')
    return toOptimizer(await this.#optimizerRow(optimizerId))
  }

  async getNote(noteId: string): Promise<FsrsOptimizer> {
    assertNonEmpty(noteId, 'Note id')
    const note = await this.#database.get<{ id: string }>('SELECT id FROM notes WHERE id = ?', [noteId])
    if (!note)
      throw new Error(`Unknown Note: ${noteId}`)
    return this.effective(noteId)
  }

  async getNoteCount(optimizerId: string): Promise<number> {
    assertNonEmpty(optimizerId, 'FSRS Optimizer id')
    const optimizer = await this.#optimizerRow(optimizerId)
    const row = optimizer.is_global === 1
      ? await this.#database.get<CountRow>(
          'SELECT COUNT(*) AS count FROM notes n LEFT JOIN learning_note_optimizer_assignments a ON a.note_id = n.id WHERE COALESCE(a.optimizer_id, ?) = ?',
          [GLOBAL_OPTIMIZER_ID, GLOBAL_OPTIMIZER_ID],
        )
      : await this.#database.get<CountRow>(
          'SELECT COUNT(*) AS count FROM learning_note_optimizer_assignments WHERE optimizer_id = ?',
          [optimizerId],
        )
    if (!row)
      throw new Error(`Failed to count Notes for FSRS Optimizer ${optimizerId}`)
    return row.count
  }

  async list(): Promise<readonly FsrsOptimizer[]> {
    const rows = await this.#database.all<OptimizerRow>(
      'SELECT o.optimizer_id, o.name, o.is_global, o.status, o.current_revision_id, o.created_at, o.updated_at, r.configuration_json FROM learning_optimizers o JOIN learning_optimizer_revisions r ON r.revision_id = o.current_revision_id ORDER BY o.is_global DESC, o.name COLLATE NOCASE',
    )
    return rows.map(toOptimizer)
  }
}
