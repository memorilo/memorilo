import type { EditorStorageDatabase, StorageOperationRunner } from './database-driver'
import type { BookFileFingerprint, BookTopicContext } from './editor-storage-contracts'
import type { BookTopicContextRow } from './editor-storage-rows'
import {
  assertBookFileBinding,
  assertBookFileSha256,
  assertReadingFormat,
} from '@memorilo/reading-model'
import { assertNonEmpty } from './editor-storage-shared'

interface EditorBookTopicContextRepositoryDependencies {
  database: EditorStorageDatabase
  runOperation: StorageOperationRunner
}

const bookTopicContextSelect = `
  SELECT
    note.id AS note_id,
    note.title AS note_title,
    topic.topic_id,
    topic.title AS topic_title,
    book_topic.format,
    book_topic.content_hash,
    book_topic.byte_length,
    book_topic.original_name,
    book_topic.publication_title,
    book_topic.authors_json,
    book_topic.retrieval_hints_json
  FROM book_topics AS book_topic
  INNER JOIN notes AS note ON note.row_id = book_topic.note_row_id
  INNER JOIN topics AS topic
    ON topic.note_row_id = book_topic.note_row_id AND topic.topic_id = book_topic.topic_id
`

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

const topicOrder = 'ORDER BY note.title COLLATE NOCASE ASC, topic.title COLLATE NOCASE ASC, note.id ASC, topic.topic_id ASC'

export class EditorBookTopicContextRepository {
  readonly #database: EditorStorageDatabase
  readonly #runOperation: EditorBookTopicContextRepositoryDependencies['runOperation']

  constructor(dependencies: EditorBookTopicContextRepositoryDependencies) {
    this.#database = dependencies.database
    this.#runOperation = dependencies.runOperation
  }

  listByFile(file: BookFileFingerprint): Promise<readonly BookTopicContext[]> {
    assertReadingFormat(file.format)
    assertBookFileSha256(file.sha256)
    return this.#runOperation(async () => {
      const rows = await this.#database.all<BookTopicContextRow>(`${bookTopicContextSelect}
        WHERE book_topic.format = ? AND book_topic.content_hash = ?
        ${topicOrder}
      `, [file.format, file.sha256])
      return rows.map(toBookTopicContext)
    })
  }

  listByReadingId(readingId: string): Promise<readonly BookTopicContext[]> {
    assertNonEmpty(readingId, 'Book retrieval reading id')
    return this.#runOperation(async () => {
      const rows = await this.#database.all<BookTopicContextRow>(`${bookTopicContextSelect}
        WHERE EXISTS (
          SELECT 1
          FROM json_each(book_topic.retrieval_hints_json) AS hint
          WHERE json_extract(hint.value, '$.readingId') = ?
        )
        ${topicOrder}
      `, [readingId])
      return rows.map(toBookTopicContext)
    })
  }
}
