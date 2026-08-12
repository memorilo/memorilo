import type {
  EditorStorage,
  EmbeddingModel,
  LearningCardProjection,
} from '../index'
import { SqliteEditorStorage } from '../index'
import { SqliteTestDatabase } from '../sqlite-test-database'

const embeddingModel: EmbeddingModel = {
  dimensions: 3,
  embedDocuments: async texts => texts.map(() => Float32Array.from([1, 0, 0])),
  embedQuery: async () => Float32Array.from([1, 0, 0]),
  id: 'test/learning-storage',
}

export interface LearningStorageHarness {
  database: SqliteTestDatabase
  noteId: string
  storage: EditorStorage
}

export class LearningStorageTestFixtures {
  readonly #harnesses: LearningStorageHarness[] = []

  async create(path?: string): Promise<LearningStorageHarness> {
    const database = new SqliteTestDatabase(path)
    try {
      const storage = await SqliteEditorStorage.open({ database, databaseOwnership: 'owned', embeddingModel })
      const note = await storage.notes.openMostRecentNote()
      const harness = { database, noteId: note.id, storage }
      this.#harnesses.push(harness)
      return harness
    }
    catch (error) {
      await database.close()
      throw error
    }
  }

  async close(harness: LearningStorageHarness): Promise<void> {
    await harness.storage.close()
    const index = this.#harnesses.indexOf(harness)
    if (index >= 0)
      this.#harnesses.splice(index, 1)
  }

  async closeAll(): Promise<void> {
    await Promise.all(this.#harnesses.splice(0).map(harness => harness.storage.close()))
  }
}

export function basicCard(cardId: string, sourceBlockId = cardId): LearningCardProjection {
  return {
    cardId,
    direction: 'forward',
    itemBlockIds: [],
    kind: 'basic',
    sourceBlockId,
  }
}

export async function reconcile(
  harness: LearningStorageHarness,
  cards: readonly LearningCardProjection[],
  topicId = 'topic',
): Promise<void> {
  await harness.storage.learning.cards.reconcileTopicCards({
    cards,
    noteId: harness.noteId,
    topicId,
    topicOrder: 0,
  })
}
