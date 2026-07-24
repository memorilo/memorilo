import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'

import * as schema from './schema'

export function createInMemoryDatabase() {
  return drizzle(new Database(':memory:'), { schema })
}

export function createDatabase(path: string) {
  return drizzle(new Database(path), { schema })
}
