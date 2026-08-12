import { defaultOptimizerConfiguration } from '@memorilo/srs'
import { afterEach, describe, expect, it } from 'vitest'
import { SqliteTestDatabase } from '../sqlite-test-database'
import { LearningOptimizerRescheduler } from './learning-optimizer-rescheduler'
import { GLOBAL_OPTIMIZER_ID, learningSchema } from './schema'

const databases: SqliteTestDatabase[] = []
const configuration = defaultOptimizerConfiguration()

async function createDatabase(): Promise<SqliteTestDatabase> {
  const database = new SqliteTestDatabase()
  databases.push(database)
  await database.exec(learningSchema)
  await database.batch([
    {
      parameters: [GLOBAL_OPTIMIZER_ID, 'Global', 'global-revision'],
      sql: 'INSERT INTO learning_optimizers (optimizer_id, name, is_global, status, current_revision_id, created_at, updated_at) VALUES (?, ?, 1, \'active\', ?, 1, 1)',
    },
    {
      parameters: ['global-revision', GLOBAL_OPTIMIZER_ID, JSON.stringify(configuration)],
      sql: 'INSERT INTO learning_optimizer_revisions (revision_id, optimizer_id, configuration_json, fsrs_version, created_at) VALUES (?, ?, ?, \'5.2.0\', 1)',
    },
    {
      parameters: ['current-revision', GLOBAL_OPTIMIZER_ID, JSON.stringify(configuration)],
      sql: 'INSERT INTO learning_optimizer_revisions (revision_id, optimizer_id, configuration_json, fsrs_version, created_at) VALUES (?, ?, ?, \'5.2.0\', 1)',
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
      parameters: [`card-${targetId}`, noteId, `source-${targetId}`],
      sql: 'INSERT INTO learning_cards (card_id, note_id, topic_id, topic_order, source_block_id, source_order, kind, direction, active, first_seen_at, last_seen_at) VALUES (?, ?, \'topic\', 0, ?, 0, \'basic\', \'forward\', 1, 1, 1)',
    },
    {
      parameters: [targetId, `card-${targetId}`],
      sql: 'INSERT INTO learning_targets (target_id, card_id, target_kind, target_order, active, created_at) VALUES (?, ?, \'whole\', 0, 1, 1)',
    },
    {
      parameters: [targetId, revisionId],
      sql: 'INSERT INTO learning_states (target_id, phase, due_at, stability, difficulty, scheduled_days, learning_steps, reps, lapses, optimizer_revision_id, state_hash) VALUES (?, \'new\', 1, 1, 1, 0, 0, 0, 0, ?, \'hash\')',
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
        parameters: ['archived-optimizer', 'Archived', 'archived-revision'],
        sql: 'INSERT INTO learning_optimizers (optimizer_id, name, is_global, status, current_revision_id, created_at, updated_at) VALUES (?, ?, 0, \'active\', ?, 1, 1)',
      },
      {
        parameters: ['archived-revision', 'archived-optimizer', JSON.stringify(configuration)],
        sql: 'INSERT INTO learning_optimizer_revisions (revision_id, optimizer_id, configuration_json, fsrs_version, created_at) VALUES (?, ?, ?, \'5.2.0\', 1)',
      },
      {
        parameters: ['assigned-note', 'archived-optimizer', 1],
        sql: 'INSERT INTO learning_note_optimizer_assignments (note_id, optimizer_id, updated_at) VALUES (?, ?, ?)',
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
          return [{ parameters: [optimizer.revisionId, target.targetId], sql: 'UPDATE learning_states SET optimizer_revision_id = ? WHERE target_id = ?' }]
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
        parameters: ['optimizer', 'Optimizer', 'revision-old'],
        sql: 'INSERT INTO learning_optimizers (optimizer_id, name, is_global, status, current_revision_id, created_at, updated_at) VALUES (?, ?, 0, \'active\', ?, 1, 1)',
      },
      {
        parameters: ['revision-old', 'optimizer', JSON.stringify(configuration)],
        sql: 'INSERT INTO learning_optimizer_revisions (revision_id, optimizer_id, configuration_json, fsrs_version, created_at) VALUES (?, ?, ?, \'5.2.0\', 1)',
      },
      {
        parameters: ['revision-new', 'optimizer', JSON.stringify(configuration)],
        sql: 'INSERT INTO learning_optimizer_revisions (revision_id, optimizer_id, configuration_json, fsrs_version, created_at) VALUES (?, ?, ?, \'5.2.0\', 1)',
      },
    ])
    await seedTarget(database, 'note', 'target', 'revision-old')
    await database.batch([{
      parameters: ['note', 'optimizer', 1],
      sql: 'INSERT INTO learning_note_optimizer_assignments (note_id, optimizer_id, updated_at) VALUES (?, ?, ?)',
    }])
    const rescheduler = new LearningOptimizerRescheduler({
      database,
      resolveOptimizer: async () => ({ configuration, revisionId: 'unused' }),
      history: {
        buildRescheduleCommands: async (target, optimizer) => [{
          parameters: [optimizer.revisionId, target.targetId],
          sql: 'UPDATE learning_states SET optimizer_revision_id = ? WHERE target_id = ?',
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
