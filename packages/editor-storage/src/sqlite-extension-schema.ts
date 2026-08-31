import { blob, customType, integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core'

const vecInteger = customType<{ data: number, driverData: bigint }>({
  dataType: () => 'integer',
  fromDriver: value => Number(value),
  toDriver: value => BigInt(value),
})

// These virtual tables are created only after their SQLite extensions are
// available, so they must stay outside the schema consumed by Drizzle Kit.
export const topicBlockEmbeddings = sqliteTable('topic_block_embeddings', {
  blockRowId: vecInteger('block_row_id').primaryKey(),
  distance: real(),
  embedding: blob().notNull(),
  k: vecInteger(),
  noteRowId: vecInteger('note_row_id').notNull(),
})

export const topicBlocksFts = sqliteTable('topic_blocks_fts', {
  rowId: integer('rowid').primaryKey(),
  text: text().notNull(),
})
