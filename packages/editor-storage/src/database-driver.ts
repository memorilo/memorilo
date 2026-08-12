export type DatabaseValue = bigint | number | string | Uint8Array | null

export interface DatabaseCommand {
  parameters?: readonly DatabaseValue[]
  sql: string
}

/** Admits one complete storage operation into its owner's lifecycle. */
export type StorageOperationRunner = <Result>(operation: () => Promise<Result>) => Promise<Result>

/**
 * Platform adapter for a SQLite database with FTS5 and sqlite-vec enabled.
 * Implementations must preserve command order and execute batches atomically.
 */
export interface EditorStorageDatabase {
  all: <Row>(sql: string, parameters?: readonly DatabaseValue[]) => Promise<readonly Row[]>
  batch: (commands: readonly DatabaseCommand[]) => Promise<void>
  close: () => Promise<void>
  exec: (sql: string) => Promise<void>
  get: <Row>(sql: string, parameters?: readonly DatabaseValue[]) => Promise<Row | undefined>
  run: (sql: string, parameters?: readonly DatabaseValue[]) => Promise<void>
}
