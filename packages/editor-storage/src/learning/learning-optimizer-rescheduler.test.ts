import { defaultOptimizerConfiguration } from '@memorilo/srs'
import { eq } from 'drizzle-orm'
import { afterEach, describe, expect, it } from 'vitest'
import {
  learningCards,
  learningNoteOptimizerAssignments,
  learningOptimizerRevisions,
  learningOptimizers,
  learningStates,
  learningTargets,
} from '../drizzle-schema'
import { SqliteTestDatabase } from '../sqlite-test-database'
import { LearningOptimizerRescheduler } from './learning-optimizer-rescheduler'
import { GLOBAL_OPTIMIZER_ID } from './schema'

const databases: SqliteTestDatabase[] = []
const configuration = defaultOptimizerConfiguration()

async function createDatabase(): Promise<SqliteTestDatabase> {
  const database = new SqliteTestDatabase()
  databases.push(database)
  database.migrate()
  await database.batch([
    {
      drizzle: orm => orm.insert(learningOptimizers).values({ optimizerId: GLOBAL_OPTIMIZER_ID, name: 'Global', isGlobal: 1, status: 'active', currentRevisionId: 'global-revision', createdAt: 1, updatedAt: 1 }).run(),
    },
    {
      drizzle: orm => orm.insert(learningOptimizerRevisions).values({ revisionId: 'global-revision', optimizerId: GLOBAL_OPTIMIZER_ID, configurationJson: JSON.stringify(configuration), fsrsVersion: '5.2.0', createdAt: 1 }).run(),
    },
    {
      drizzle: orm => orm.insert(learningOptimizerRevisions).values({ revisionId: 'current-revision', optimizerId: GLOBAL_OPTIMIZER_ID, configurationJson: JSON.stringify(configuration), fsrsVersion: '5.2.0', createdAt: 1 }).run(),
    },
  ])
  return database
}

async function seedTarget(
  database: SqliteTestDatabase,
  noteId: string,
  targetId: string,
  revisionId: string,
): Promise<void> {
  await database.batch([
    {
      drizzle: orm => orm.insert(learningCards).values({ cardId: `card-${targetId}`, noteId, topicId: 'topic', topicOrder: 0, sourceBlockId: `source-${targetId}`, sourceOrder: 0, kind: 'basic', direction: 'forward', active: 1, firstSeenAt: 1, lastSeenAt: 1 }).run(),
    },
    {
      drizzle: orm => orm.insert(learningTargets).values({ targetId, cardId: `card-${targetId}`, targetKind: 'whole', targetOrder: 0, active: 1, createdAt: 1 }).run(),
    },
    {
      drizzle: orm => orm.insert(learningStates).values({ targetId, phase: 'new', dueAt: 1, stability: 1, difficulty: 1, scheduledDays: 0, learningSteps: 0, reps: 0, lapses: 0, optimizerRevisionId: revisionId, stateHash: 'hash' }).run(),
    },
  ])
}

afterEach(async () => {
  await Promise.all(databases.splice(0).map(database => database.close()))
})

describe('learning optimizer rescheduler', () => {
  it('replays every affected target and moves assignments in one transaction when archiving', async () => {
    const database = await createDatabase()
    await database.batch([
      {
        drizzle: orm => orm.insert(learningOptimizers).values({ optimizerId: 'archived-optimizer', name: 'Archived', isGlobal: 0, status: 'active', currentRevisionId: 'archived-revision', createdAt: 1, updatedAt: 1 }).run(),
      },
      {
        drizzle: orm => orm.insert(learningOptimizerRevisions).values({ revisionId: 'archived-revision', optimizerId: 'archived-optimizer', configurationJson: JSON.stringify(configuration), fsrsVersion: '5.2.0', createdAt: 1 }).run(),
      },
      {
        drizzle: orm => orm.insert(learningNoteOptimizerAssignments).values({ noteId: 'assigned-note', optimizerId: 'archived-optimizer', updatedAt: 1 }).run(),
      },
    ])
    await seedTarget(database, 'assigned-note', 'assigned-target', 'archived-revision')
    await seedTarget(database, 'historical-note', 'historical-target', 'archived-revision')

    const destinations: { revisionId: string, targetId: string }[] = []
    const rescheduler = new LearningOptimizerRescheduler({
      database,
      now: () => 123,
      resolveOptimizer: async () => ({ configuration, revisionId: 'current-revision' }),
      history: {
        buildRescheduleCommands: async (target, optimizer) => {
          destinations.push({ revisionId: optimizer.revisionId, targetId: target.targetId })
          return [{ drizzle: orm => orm.update(learningStates).set({ optimizerRevisionId: optimizer.revisionId }).where(eq(learningStates.targetId, target.targetId)).run() }]
        },
      },
    })

    await rescheduler.archive('archived-optimizer', { configuration, revisionId: 'global-revision' })

    expect(destinations).toEqual([
      { revisionId: 'global-revision', targetId: 'assigned-target' },
      { revisionId: 'current-revision', targetId: 'historical-target' },
    ])
    expect(await database.get<{ optimizer_revision_id: string }>(
      'SELECT optimizer_revision_id FROM learning_states WHERE target_id = ?',
      ['assigned-target'],
    )).toEqual({ optimizer_revision_id: 'global-revision' })
    expect(await database.get<{ optimizer_revision_id: string }>(
      'SELECT optimizer_revision_id FROM learning_states WHERE target_id = ?',
      ['historical-target'],
    )).toEqual({ optimizer_revision_id: 'current-revision' })
    expect(await database.get<{ optimizer_id: string }>(
      'SELECT optimizer_id FROM learning_note_optimizer_assignments WHERE note_id = ?',
      ['assigned-note'],
    )).toEqual({ optimizer_id: GLOBAL_OPTIMIZER_ID })
    expect(await database.get<{ status: string }>(
      'SELECT status FROM learning_optimizers WHERE optimizer_id = ?',
      ['archived-optimizer'],
    )).toEqual({ status: 'archived' })
  })

  it('builds executable revision replay commands without publishing them', async () => {
    const database = await createDatabase()
    await database.batch([
      {
        drizzle: orm => orm.insert(learningOptimizers).values({ optimizerId: 'optimizer', name: 'Optimizer', isGlobal: 0, status: 'active', currentRevisionId: 'revision-old', createdAt: 1, updatedAt: 1 }).run(),
      },
      {
        drizzle: orm => orm.insert(learningOptimizerRevisions).values({ revisionId: 'revision-old', optimizerId: 'optimizer', configurationJson: JSON.stringify(configuration), fsrsVersion: '5.2.0', createdAt: 1 }).run(),
      },
      {
        drizzle: orm => orm.insert(learningOptimizerRevisions).values({ revisionId: 'revision-new', optimizerId: 'optimizer', configurationJson: JSON.stringify(configuration), fsrsVersion: '5.2.0', createdAt: 1 }).run(),
      },
    ])
    await seedTarget(database, 'note', 'target', 'revision-old')
    await database.batch([{
      drizzle: orm => orm.insert(learningNoteOptimizerAssignments).values({ noteId: 'note', optimizerId: 'optimizer', updatedAt: 1 }).run(),
    }])
    const rescheduler = new LearningOptimizerRescheduler({
      database,
      resolveOptimizer: async () => ({ configuration, revisionId: 'unused' }),
      history: {
        buildRescheduleCommands: async (target, optimizer) => [{
          drizzle: orm => orm.update(learningStates).set({ optimizerRevisionId: optimizer.revisionId }).where(eq(learningStates.targetId, target.targetId)).run(),
        }],
      },
    })

    const commands = await rescheduler.commandsForRevision('optimizer', 'revision-new', configuration)
    expect(commands).toHaveLength(1)
    await database.batch(commands)
    expect(await database.get<{ optimizer_revision_id: string }>(
      'SELECT optimizer_revision_id FROM learning_states WHERE target_id = ?',
      ['target'],
    )).toEqual({ optimizer_revision_id: 'revision-new' })
  })
})
