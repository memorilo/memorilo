import type { EditorStorageDatabase } from './database-driver'

export const mainDatabaseSchemaGeneration = 1

export class UnsupportedDatabaseGenerationError extends Error {
  override readonly name = 'UnsupportedDatabaseGenerationError'

  constructor(
    readonly generation: number,
    readonly expectedGeneration: number,
  ) {
    super(`Unsupported database schema generation ${generation}; expected ${expectedGeneration}`)
  }
}

interface UserVersionRow {
  user_version: number
}

interface ExistingTableRow {
  name: string
}

/**
 * Validates and initializes the shared database generation without deleting
 * user data. Schema DDL is owned by EditorStorage and runs after this step.
 */
export async function prepareMainDatabase(database: EditorStorageDatabase): Promise<void> {
  const version = await database.get<UserVersionRow>('PRAGMA user_version')
  if (!version || !Number.isSafeInteger(version.user_version) || version.user_version < 0)
    throw new Error('The main database has an invalid schema generation')

  if (version.user_version === mainDatabaseSchemaGeneration)
    return

  if (version.user_version === 0) {
    const existingTable = await database.get<ExistingTableRow>(`
      SELECT name
      FROM sqlite_master
      WHERE type = 'table'
        AND name NOT LIKE 'sqlite_%'
      LIMIT 1
    `)
    if (existingTable === undefined) {
      await database.exec(`PRAGMA user_version = ${mainDatabaseSchemaGeneration}`)
      return
    }
  }

  throw new UnsupportedDatabaseGenerationError(
    version.user_version,
    mainDatabaseSchemaGeneration,
  )
}
