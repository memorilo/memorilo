import type { EditorStorageDatabase } from './database-driver'
import { v7 as createUuidV7 } from 'uuid'
import { shelfSyncState } from './drizzle-schema'

export async function initializeShelfStorage(database: EditorStorageDatabase): Promise<void> {
  await database.migrate()
  database.drizzle.insert(shelfSyncState)
    .values({ singleton: 1, actorId: createUuidV7(), lastPhysical: 0, lastLogical: 0 })
    .onConflictDoNothing()
    .run()
}
