import type { EditorStorageDatabase, EditorStorageDrizzleDatabase } from '../database-driver'
import type { LearningReviewOptimizer } from './learning-review-history'
import type { FsrsOptimizer } from './types'
import { asc, desc, eq, sql } from 'drizzle-orm'
import { learningNoteOptimizerAssignments, learningOptimizerRevisions, learningOptimizers, notes } from '../drizzle-schema'
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
  readonly #orm: EditorStorageDrizzleDatabase

  constructor(database: EditorStorageDatabase) {
    this.#database = database
    this.#orm = database.drizzle
  }

  async #optimizerRow(optimizerId: string): Promise<OptimizerRow> {
    const row = this.#orm.select({
      optimizer_id: learningOptimizers.optimizerId,
      name: learningOptimizers.name,
      is_global: learningOptimizers.isGlobal,
      status: learningOptimizers.status,
      current_revision_id: learningOptimizers.currentRevisionId,
      created_at: learningOptimizers.createdAt,
      updated_at: learningOptimizers.updatedAt,
      configuration_json: learningOptimizerRevisions.configurationJson,
    }).from(learningOptimizers).innerJoin(learningOptimizerRevisions, eq(learningOptimizerRevisions.revisionId, learningOptimizers.currentRevisionId)).where(eq(learningOptimizers.optimizerId, optimizerId)).get() as OptimizerRow | undefined
    if (!row)
      throw new Error(`Unknown FSRS Optimizer: ${optimizerId}`)
    return row
  }

  async effective(noteId: string): Promise<EffectiveLearningOptimizer> {
    assertNonEmpty(noteId, 'Note id')
    const assignment = this.#orm.select({ optimizerId: learningNoteOptimizerAssignments.optimizerId })
      .from(learningNoteOptimizerAssignments)
      .where(eq(learningNoteOptimizerAssignments.noteId, noteId))
      .get()
    const row = this.#orm.select({
      optimizer_id: learningOptimizers.optimizerId,
      name: learningOptimizers.name,
      is_global: learningOptimizers.isGlobal,
      status: learningOptimizers.status,
      current_revision_id: learningOptimizers.currentRevisionId,
      created_at: learningOptimizers.createdAt,
      updated_at: learningOptimizers.updatedAt,
      configuration_json: learningOptimizerRevisions.configurationJson,
    }).from(learningOptimizers).innerJoin(learningOptimizerRevisions, eq(learningOptimizerRevisions.revisionId, learningOptimizers.currentRevisionId)).where(eq(learningOptimizers.optimizerId, assignment?.optimizerId ?? GLOBAL_OPTIMIZER_ID)).get() as OptimizerRow | undefined
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
    const note = this.#orm.select({ id: notes.id }).from(notes).where(eq(notes.id, noteId)).get()
    if (!note)
      throw new Error(`Unknown Note: ${noteId}`)
    return this.effective(noteId)
  }

  async getNoteCount(optimizerId: string): Promise<number> {
    assertNonEmpty(optimizerId, 'FSRS Optimizer id')
    const optimizer = await this.#optimizerRow(optimizerId)
    const row = optimizer.is_global === 1
      ? this.#orm.select({ count: sql<number>`count(*)` }).from(notes).leftJoin(learningNoteOptimizerAssignments, eq(learningNoteOptimizerAssignments.noteId, notes.id)).where(sql`COALESCE(${learningNoteOptimizerAssignments.optimizerId}, ${GLOBAL_OPTIMIZER_ID}) = ${GLOBAL_OPTIMIZER_ID}`).get()
      : this.#orm.select({ count: sql<number>`count(*)` }).from(learningNoteOptimizerAssignments).where(eq(learningNoteOptimizerAssignments.optimizerId, optimizerId)).get()
    if (!row)
      throw new Error(`Failed to count Notes for FSRS Optimizer ${optimizerId}`)
    return row.count
  }

  async list(): Promise<readonly FsrsOptimizer[]> {
    const rows = this.#orm.select({
      optimizer_id: learningOptimizers.optimizerId,
      name: learningOptimizers.name,
      is_global: learningOptimizers.isGlobal,
      status: learningOptimizers.status,
      current_revision_id: learningOptimizers.currentRevisionId,
      created_at: learningOptimizers.createdAt,
      updated_at: learningOptimizers.updatedAt,
      configuration_json: learningOptimizerRevisions.configurationJson,
    }).from(learningOptimizers).innerJoin(learningOptimizerRevisions, eq(learningOptimizerRevisions.revisionId, learningOptimizers.currentRevisionId)).orderBy(desc(learningOptimizers.isGlobal), asc(sql`lower(${learningOptimizers.name})`)).all() as OptimizerRow[]
    return rows.map(toOptimizer)
  }
}
