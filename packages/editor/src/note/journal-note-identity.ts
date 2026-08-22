export type EditorNoteIdentity
  = | { kind: 'regular' }
    | { journalDate: string, kind: 'journal' }

const journalNotePrefix = 'journal:'

export function assertJournalDate(value: unknown, name = 'Journal date'): asserts value is string {
  if (typeof value !== 'string')
    throw new TypeError(`${name} must be a string`)
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(value)
  if (!match)
    throw new TypeError(`${name} must use YYYY-MM-DD format`)
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  if (year < 1)
    throw new RangeError(`${name} year must be between 0001 and 9999`)
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  const maximumDay = daysInMonth[month - 1]
  if (maximumDay === undefined || day < 1 || day > maximumDay)
    throw new RangeError(`${name} must be a valid calendar date`)
}

export function journalNoteId(journalDate: string): string {
  assertJournalDate(journalDate)
  return `${journalNotePrefix}${journalDate}`
}

export function journalDateFromNoteId(noteId: string): string | null {
  if (!noteId.startsWith(journalNotePrefix))
    return null
  const journalDate = noteId.slice(journalNotePrefix.length)
  assertJournalDate(journalDate, 'Journal Note id date')
  return journalDate
}

export function journalInitialTopicId(journalDate: string): string {
  return `${journalNoteId(journalDate)}:topic`
}

export function journalInitialBlockId(journalDate: string): string {
  return `${journalNoteId(journalDate)}:block`
}
