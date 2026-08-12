export function normalizeNonEmptyString(value: string, name: string): string {
  const normalized = value.trim()
  if (normalized.length === 0)
    throw new TypeError(`${name} must be a non-empty string`)
  return normalized
}

export function normalizeTopicTitle(value: string): string {
  if (typeof value !== 'string')
    throw new TypeError('Topic title must be a string')
  return value.trim()
}

export function resolveNoteEntryIndex(index: number | undefined): number | undefined {
  if (index === undefined)
    return undefined
  if (!Number.isInteger(index) || index < 0)
    throw new RangeError('NoteEntry index must be a non-negative integer')
  return index
}
