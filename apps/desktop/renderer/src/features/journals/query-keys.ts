export const journalQueryKeys = {
  all: ['journals'] as const,
  datesAll: ['journals', 'dates'] as const,
  dates: (from: string, through: string) => ['journals', 'dates', from, through] as const,
  feed: ['journals', 'feed'] as const,
  today: ['journals', 'today'] as const,
}
