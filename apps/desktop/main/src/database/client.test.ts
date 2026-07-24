import { sql } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'

import { createInMemoryDatabase } from './client'

describe('createInMemoryDatabase', () => {
  it('executes a query through Drizzle on SQLite', () => {
    const database = createInMemoryDatabase()

    expect(database.get<{ value: number }>(sql`select 1 as value`)).toEqual({ value: 1 })

    database.$client.close()
  })
})
