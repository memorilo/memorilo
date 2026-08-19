import type { EditorStorageDatabase } from './database-driver'

export interface MainDatabaseSchemaObject {
  name: string
  sql: string
  type: 'index' | 'table' | 'trigger' | 'view'
}

export interface MainDatabaseSchemaInspection {
  learningSchemaGeneration: number | null
  objects: readonly MainDatabaseSchemaObject[]
  userVersion: number
}

/**
 * Serializes a schema inspection for cross-platform parity checks. Keep this
 * format independent of the SQLite driver so desktop and native callers can
 * compare the same bytes.
 */
export function serializeMainDatabaseSchemaInspection(
  inspection: MainDatabaseSchemaInspection,
): string {
  return `${JSON.stringify({
    learningSchemaGeneration: inspection.learningSchemaGeneration,
    objects: inspection.objects.map(object => ({
      name: object.name,
      sql: object.sql,
      type: object.type,
    })),
    userVersion: inspection.userVersion,
  }, null, 2)}\n`
}

interface SchemaObjectRow {
  name: string
  sql: string | null
  type: MainDatabaseSchemaObject['type']
}

interface UserVersionRow {
  user_version: number
}

interface LearningSchemaRow {
  schema_generation: number
}

function normalizeSql(sql: string): string {
  return sql.trim().replace(/\s+/gu, ' ')
}

function isVirtualTable(sql: string): boolean {
  return /\bUSING\s+(?:fts5|vec0)\b/iu.test(sql)
}

/**
 * Returns the application-owned schema in a stable form for desktop/mobile
 * parity checks. SQLite virtual-table shadow tables are implementation detail.
 */
export async function inspectMainDatabaseSchema(
  database: EditorStorageDatabase,
): Promise<MainDatabaseSchemaInspection> {
  const version = await database.get<UserVersionRow>('PRAGMA user_version')
  if (!version || !Number.isSafeInteger(version.user_version) || version.user_version < 0)
    throw new Error('The main database has an invalid schema generation')

  const rows = await database.all<SchemaObjectRow>(`
    SELECT type, name, sql
    FROM sqlite_master
    WHERE type IN ('table', 'index', 'trigger', 'view')
      AND name NOT LIKE 'sqlite_%'
    ORDER BY type, name
  `)
  const virtualTables = rows
    .filter(row => row.sql !== null && isVirtualTable(row.sql))
    .map(row => row.name)
  const objects = rows.flatMap((row): MainDatabaseSchemaObject[] => {
    if (row.sql === null || virtualTables.some(name => row.name.startsWith(`${name}_`)))
      return []
    return [{ name: row.name, sql: normalizeSql(row.sql), type: row.type }]
  })
  const learning = await database.get<LearningSchemaRow>(`
    SELECT schema_generation
    FROM learning_sync_state
    WHERE singleton = 1
  `)

  return {
    learningSchemaGeneration: learning?.schema_generation ?? null,
    objects,
    userVersion: version.user_version,
  }
}
