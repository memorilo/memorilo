import type { JournalDate } from './editor-storage-contracts'

export function assertNonEmpty(value: string, name: string): void {
  if (value.trim().length === 0)
    throw new TypeError(`${name} must be a non-empty string`)
}

export function optionalJournalDate(value: JournalDate | undefined, name: string): JournalDate | null {
  if (value === undefined)
    return null
  assertJournalDate(value, name)
  return value
}

export function readJournalDate(value: unknown, name: string): JournalDate {
  assertJournalDate(value, name)
  return value
}

export function readStoredNoteJournalDate(
  value: string | null,
  noteId: string,
  noteTitle: string,
): JournalDate | undefined {
  if (value === null)
    return undefined
  assertJournalDate(value, `Stored Journal date for Note ${noteId}`)
  if (noteTitle !== value)
    throw new Error(`Journal ${value} has a non-canonical stored Note title`)
  return value
}

export function resolveLimit(limit: number | undefined, fallback: number, maximum: number): number {
  const resolved = limit ?? fallback
  if (!Number.isInteger(resolved) || resolved < 1 || resolved > maximum)
    throw new RangeError(`Limit must be an integer between 1 and ${maximum}`)
  return resolved
}

export function assertJournalDate(value: unknown, name = 'Journal date'): asserts value is JournalDate {
  if (typeof value !== 'string')
    throw new TypeError(`${name} must be a string`)
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(value)
  if (!match)
    throw new TypeError(`${name} must use YYYY-MM-DD format`)
  const yearText = match[1]
  const monthText = match[2]
  const dayText = match[3]
  if (yearText === undefined || monthText === undefined || dayText === undefined)
    throw new Error(`Failed to parse ${name}`)
  const year = Number(yearText)
  const month = Number(monthText)
  const day = Number(dayText)
  if (year < 1)
    throw new RangeError(`${name} year must be between 0001 and 9999`)
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  const maximumDay = daysInMonth[month - 1]
  if (maximumDay === undefined || day < 1 || day > maximumDay)
    throw new RangeError(`${name} must be a valid calendar date`)
}

export const visibleJournalPredicate = `
  (? IS NULL
    OR journal.note_row_id IS NULL
    OR journal.has_user_content = 1
    OR journal.journal_date = ?)
`
