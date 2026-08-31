import type { DatabaseCommand, EditorStorageDatabase, EditorStorageDrizzleDatabase } from '../database-driver'
import type { LearningOptimizerCatalog } from './learning-optimizer-catalog'
import type { LearningOptimizerRescheduler } from './learning-optimizer-rescheduler'
import type {
  AssignNoteOptimizerInput,
  CreateFsrsOptimizerInput,
  FsrsOptimizer,
  SaveFsrsOptimizerInput,
} from './types'
import {
  defaultOptimizerConfiguration,
  FSRSVersion,
  validateOptimizerConfiguration,
} from '@memorilo/srs'
import { eq } from 'drizzle-orm'
import { v7 as createUuidV7 } from 'uuid'
import { learningNoteOptimizerAssignments, learningOptimizerRevisions, learningOptimizers, notes } from '../drizzle-schema'
import { assertNonEmpty, syncMutationCommand } from './learning-storage-shared'
import { GLOBAL_OPTIMIZER_ID } from './schema'

interface LearningOptimizerMutationsDependencies {
  catalog: LearningOptimizerCatalog
  database: EditorStorageDatabase
  rescheduler: LearningOptimizerRescheduler
}

export class LearningOptimizerMutations {
  readonly #catalog: LearningOptimizerCatalog
  readonly #database: EditorStorageDatabase
  readonly #orm: EditorStorageDrizzleDatabase
  readonly #rescheduler: LearningOptimizerRescheduler

  constructor({
    catalog,
    database,
    rescheduler,
  }: LearningOptimizerMutationsDependencies) {
    this.#catalog = catalog
    this.#database = database
    this.#orm = database.drizzle
    this.#rescheduler = rescheduler
  }

  async save(
    input: SaveFsrsOptimizerInput,
    expectedRevisionId?: string,
  ): Promise<FsrsOptimizer> {
    assertNonEmpty(input.optimizerId, 'FSRS Optimizer id')
    const name = input.name.trim()
    assertNonEmpty(name, 'FSRS Optimizer name')
    const configuration = validateOptimizerConfiguration(input.configuration)
    const current = await this.#catalog.get(input.optimizerId)
    if (current.status !== 'active')
      throw new Error(`Cannot update archived FSRS Optimizer ${input.optimizerId}`)
    if (expectedRevisionId !== undefined && current.revisionId !== expectedRevisionId)
      throw new Error(`FSRS Optimizer ${input.optimizerId} changed while parameter optimization was running`)
    if (current.isGlobal && current.name !== name)
      throw new Error('Global FSRS Optimizer cannot be renamed')

    const configurationJson = JSON.stringify(configuration)
    const configurationChanged = JSON.stringify(current.configuration) !== configurationJson
    const nameChanged = current.name !== name
    if (!configurationChanged && !nameChanged)
      return current

    const now = Date.now()
    const revisionId = configurationChanged ? createUuidV7() : current.revisionId
    const commands: DatabaseCommand[] = []
    if (configurationChanged) {
      commands.push({
        drizzle: database => database.insert(learningOptimizerRevisions).values({
          configurationJson,
          createdAt: now,
          fsrsVersion: FSRSVersion,
          optimizerId: input.optimizerId,
          revisionId,
        }).run(),
      })
    }
    commands.push(
      {
        drizzle: database => database.update(learningOptimizers).set({
          currentRevisionId: revisionId,
          name,
          syncSequence: -1,
          updatedAt: now,
        }).where(eq(learningOptimizers.optimizerId, input.optimizerId)).run(),
      },
      syncMutationCommand('optimizer', input.optimizerId, 'upsert', {
        configuration,
        id: input.optimizerId,
        name,
        revisionId,
        status: 'active',
      }, now),
    )
    if (configurationChanged && input.rescheduleNow)
      commands.push(...await this.#rescheduler.commandsForRevision(input.optimizerId, revisionId, configuration))
    await this.#database.batch(commands)
    return this.#catalog.get(input.optimizerId)
  }

  async archive(optimizerId: string): Promise<void> {
    assertNonEmpty(optimizerId, 'FSRS Optimizer id')
    const optimizer = await this.#catalog.get(optimizerId)
    if (optimizer.isGlobal)
      throw new Error('Global FSRS Optimizer cannot be archived')
    if (optimizer.status === 'archived')
      return
    const global = await this.#catalog.get(GLOBAL_OPTIMIZER_ID)
    await this.#rescheduler.archive(optimizerId, {
      configuration: global.configuration,
      revisionId: global.revisionId,
    })
  }

  async assignNote(input: AssignNoteOptimizerInput): Promise<void> {
    assertNonEmpty(input.noteId, 'Note id')
    assertNonEmpty(input.optimizerId, 'FSRS Optimizer id')
    const optimizer = await this.#catalog.get(input.optimizerId)
    if (optimizer.status !== 'active')
      throw new Error(`Cannot assign archived FSRS Optimizer ${input.optimizerId}`)
    const note = this.#orm.select({ id: notes.id }).from(notes).where(eq(notes.id, input.noteId)).get()
    if (!note)
      throw new Error(`Unknown Note: ${input.noteId}`)
    const now = Date.now()
    await this.#database.batch([
      {
        drizzle: database => database.insert(learningNoteOptimizerAssignments).values({
          noteId: input.noteId,
          optimizerId: input.optimizerId,
          updatedAt: now,
        }).onConflictDoUpdate({
          set: { optimizerId: input.optimizerId, syncSequence: -1, updatedAt: now },
          target: learningNoteOptimizerAssignments.noteId,
        }).run(),
      },
      syncMutationCommand('assignment', input.noteId, 'upsert', input, now),
    ])
  }

  async create(input: CreateFsrsOptimizerInput): Promise<FsrsOptimizer> {
    const name = input.name.trim()
    assertNonEmpty(name, 'FSRS Optimizer name')
    const id = input.id ?? createUuidV7()
    assertNonEmpty(id, 'FSRS Optimizer id')
    const configuration = validateOptimizerConfiguration(
      input.configuration ?? defaultOptimizerConfiguration(),
    )
    const now = Date.now()
    const revisionId = createUuidV7()
    await this.#database.batch([
      {
        drizzle: database => database.insert(learningOptimizers).values({
          createdAt: now,
          currentRevisionId: revisionId,
          isGlobal: 0,
          name,
          optimizerId: id,
          status: 'active',
          updatedAt: now,
        }).run(),
      },
      {
        drizzle: database => database.insert(learningOptimizerRevisions).values({
          configurationJson: JSON.stringify(configuration),
          createdAt: now,
          fsrsVersion: FSRSVersion,
          optimizerId: id,
          revisionId,
        }).run(),
      },
      syncMutationCommand('optimizer', id, 'upsert', {
        configuration,
        id,
        name,
        revisionId,
        status: 'active',
      }, now),
    ])
    return this.#catalog.get(id)
  }

  async resetDefaults(optimizerId: string, rescheduleNow = false): Promise<FsrsOptimizer> {
    assertNonEmpty(optimizerId, 'FSRS Optimizer id')
    const current = await this.#catalog.get(optimizerId)
    return this.save({
      configuration: defaultOptimizerConfiguration(),
      name: current.name,
      optimizerId,
      rescheduleNow,
    })
  }
}
