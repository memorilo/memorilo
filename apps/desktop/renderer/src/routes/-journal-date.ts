import dayjs from 'dayjs'

const journalDatePattern = /^(\d{4})-(\d{2})-(\d{2})$/u

export function toJournalDate(date: Date): string {
  if (Number.isNaN(date.getTime()))
    throw new TypeError('Journal date must be a valid Date')
  return dayjs(date).format('YYYY-MM-DD')
}

export function fromJournalDate(value: string): Date {
  const match = journalDatePattern.exec(value)
  if (!match)
    throw new TypeError(`Invalid Journal date: ${value}`)
  const year = Number(match[1])
  const monthIndex = Number(match[2]) - 1
  const day = Number(match[3])
  const date = new Date(year, monthIndex, day, 12)
  if (date.getFullYear() !== year || date.getMonth() !== monthIndex || date.getDate() !== day)
    throw new TypeError(`Invalid Journal date: ${value}`)
  return date
}

export function journalMonthBounds(date: Date): { from: string, through: string } {
  const month = dayjs(date)
  return {
    from: month.startOf('month').format('YYYY-MM-DD'),
    through: month.endOf('month').format('YYYY-MM-DD'),
  }
}

export function startOfJournalMonth(date: Date): Date {
  return dayjs(date).startOf('month').toDate()
}

export function formatJournalHeading(journalDate: string): string {
  return dayjs(fromJournalDate(journalDate)).format('dddd, LL')
}
