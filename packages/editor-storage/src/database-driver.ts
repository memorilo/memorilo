import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core'
import type { editorStorageDrizzleSchema } from './drizzle-schema'

export type DatabaseValue = bigint | number | string | Uint8Array | null

/** Drizzle's synchronous SQLite surface, independent of the concrete driver. */
export type EditorStorageDrizzleDatabase = BaseSQLiteDatabase<'sync', unknown, typeof editorStorageDrizzleSchema>

export interface DatabaseCommand {
  /** Typed operation executed in the same transaction as sibling commands. */
  drizzle: (database: EditorStorageDrizzleDatabase) => void
}

/** Admits one complete storage operation into its owner's lifecycle. */
export type StorageOperationRunner = <Result>(operation: () => Promise<Result>) => Promise<Result>

/**
 * Platform adapter for a SQLite database with FTS5 and sqlite-vec enabled.
 * Implementations must preserve command order and execute batches atomically.
 */
export interface EditorStorageDatabase {
  batch: (commands: readonly DatabaseCommand[]) => Promise<void>
  close: () => Promise<void>
  /** Runs SQLite extension DDL or database-maintenance commands that Drizzle cannot model. */
  executeInfrastructureSql: (sql: string) => Promise<void>
  /** Applies the generated Drizzle migrations for this database. */
  migrate: () => Promise<void> | void
  /** Typed Drizzle handle used by every relational repository operation. */
  readonly drizzle: EditorStorageDrizzleDatabase
  /** Optional adapter hook for observing typed reads (used by lifecycle-aware test adapters). */
  readonly beforeDrizzleRead?: (sql: string) => Promise<void>
}
