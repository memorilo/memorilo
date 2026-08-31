import { BetterSqliteDatabase } from './better-sqlite-database'

export async function openCurrentMainDatabase(path: string): Promise<BetterSqliteDatabase> {
  return new BetterSqliteDatabase(path)
}
