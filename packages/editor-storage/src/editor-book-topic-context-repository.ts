import type { EditorStorageDatabase, EditorStorageDrizzleDatabase, StorageOperationRunner } from './database-driver'
import type { BookFileFingerprint, BookTopicContext } from './editor-storage-contracts'
import type { BookTopicContextRow } from './editor-storage-rows'
import {
  assertBookFileBinding,
  assertBookFileSha256,
  assertReadingFormat,
} from '@memorilo/reading-model'
import { and, asc, eq, sql } from 'drizzle-orm'
import { bookTopics, notes, topics } from './drizzle-schema'
import { assertNonEmpty } from './editor-storage-shared'

interface EditorBookTopicContextRepositoryDependencies {
  database: EditorStorageDatabase
  runOperation: StorageOperationRunner
}

function toBookTopicContext(row: BookTopicContextRow): BookTopicContext {
  const binding: unknown = {
    book: {
      authors: JSON.parse(row.authors_json),
      title: row.publication_title,
    },
    file: {
      byteLength: row.byte_length,
      format: row.format,
      originalName: row.original_name,
      sha256: row.content_hash,
    },
    retrievalHints: JSON.parse(row.retrieval_hints_json),
  }
  assertBookFileBinding(binding, `Stored BookTopic ${row.note_id}/${row.topic_id} binding`)
  return {
    book: binding,
    noteId: row.note_id,
    noteTitle: row.note_title,
    topicId: row.topic_id,
    topicTitle: row.topic_title,
  }
}

export class EditorBookTopicContextRepository {
  readonly #orm: EditorStorageDrizzleDatabase
  readonly #runOperation: EditorBookTopicContextRepositoryDependencies['runOperation']

  constructor(dependencies: EditorBookTopicContextRepositoryDependencies) {
    this.#orm = dependencies.database.drizzle
    this.#runOperation = dependencies.runOperation
  }

  listByFile(file: BookFileFingerprint): Promise<readonly BookTopicContext[]> {
    assertReadingFormat(file.format)
    assertBookFileSha256(file.sha256)
    return this.#runOperation(async () => {
      const rows = this.#orm.select({
        note_id: notes.id,
        note_title: notes.title,
        topic_id: topics.topicId,
        topic_title: topics.title,
        format: bookTopics.format,
        content_hash: bookTopics.contentHash,
        byte_length: bookTopics.byteLength,
        original_name: bookTopics.originalName,
        publication_title: bookTopics.publicationTitle,
        authors_json: bookTopics.authorsJson,
        retrieval_hints_json: bookTopics.retrievalHintsJson,
      }).from(bookTopics).innerJoin(notes, eq(notes.rowId, bookTopics.noteRowId)).innerJoin(topics, and(eq(topics.noteRowId, bookTopics.noteRowId), eq(topics.topicId, bookTopics.topicId))).where(and(eq(bookTopics.format, file.format), eq(bookTopics.contentHash, file.sha256))).orderBy(asc(sql`lower(${notes.title})`), asc(sql`lower(${topics.title})`), asc(notes.id), asc(topics.topicId)).all() as BookTopicContextRow[]
      return rows.map(toBookTopicContext)
    })
  }

  listByReadingId(readingId: string): Promise<readonly BookTopicContext[]> {
    assertNonEmpty(readingId, 'Book retrieval reading id')
    return this.#runOperation(async () => {
      const rows = this.#orm.select({
        note_id: notes.id,
        note_title: notes.title,
        topic_id: topics.topicId,
        topic_title: topics.title,
        format: bookTopics.format,
        content_hash: bookTopics.contentHash,
        byte_length: bookTopics.byteLength,
        original_name: bookTopics.originalName,
        publication_title: bookTopics.publicationTitle,
        authors_json: bookTopics.authorsJson,
        retrieval_hints_json: bookTopics.retrievalHintsJson,
      }).from(bookTopics).innerJoin(notes, eq(notes.rowId, bookTopics.noteRowId)).innerJoin(topics, and(eq(topics.noteRowId, bookTopics.noteRowId), eq(topics.topicId, bookTopics.topicId))).orderBy(asc(sql`lower(${notes.title})`), asc(sql`lower(${topics.title})`), asc(notes.id), asc(topics.topicId)).all() as BookTopicContextRow[]
      return rows.map(toBookTopicContext).filter(context => (
        context.book.retrievalHints.some(hint => hint.readingId === readingId)
      ))
    })
  }
}
