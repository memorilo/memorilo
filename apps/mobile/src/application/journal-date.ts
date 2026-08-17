import type { JournalDate } from '@memorilo/editor-storage'
import { assertJournalDate } from '@memorilo/editor-storage'

export function localJournalDate(value = new Date()): JournalDate {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime()))
    throw new TypeError('Journal clock must contain a valid date')
  const date = [
    String(value.getFullYear()).padStart(4, '0'),
    String(value.getMonth() + 1).padStart(2, '0'),
    String(value.getDate()).padStart(2, '0'),
  ].join('-')
  assertJournalDate(date, 'Local Journal date')
  return date
}

export function journalDateValue(value: JournalDate): Date {
  assertJournalDate(value)
  const [year, month, day] = value.split('-').map(Number)
  if (year === undefined || month === undefined || day === undefined)
    throw new Error(`Unable to parse Journal date ${value}`)
  return new Date(year, month - 1, day, 12)
}

export function shiftJournalDate(value: JournalDate, days: number): JournalDate {
  if (!Number.isInteger(days))
    throw new TypeError('Journal date offset must be an integer')
  const date = journalDateValue(value)
  date.setDate(date.getDate() + days)
  return localJournalDate(date)
}
