import type { NoteEntrySnapshot } from '@memorilo/editor/note'

export class ActiveReadingDeletionError extends Error {
  override readonly name = 'ActiveReadingDeletionError'

  constructor(readonly entryId: string) {
    super(`Note entry ${entryId} cannot be deleted while its BookTopic is open in a reader`)
  }
}

export function protectedReadingEntryIds(
  entries: readonly NoteEntrySnapshot[],
  activeTopicIds: ReadonlySet<string>,
): ReadonlySet<string> {
  if (activeTopicIds.size === 0)
    return new Set()
  const entriesById = new Map(entries.map(entry => [entry.id, entry]))
  const protectedIds = new Set<string>()
  for (const topicId of activeTopicIds) {
    let current = entriesById.get(topicId)
    if (!current)
      throw new Error(`Active BookTopic ${topicId} is missing from its Note`)
    while (current) {
      protectedIds.add(current.id)
      if (current.parentId === null)
        break
      const parent = entriesById.get(current.parentId)
      if (!parent)
        throw new Error(`Note entry ${current.id} has unknown parent ${current.parentId}`)
      current = parent
    }
  }
  return protectedIds
}

export function assertProtectedReadingEntriesRemain(
  protectedIds: ReadonlySet<string>,
  entries: readonly NoteEntrySnapshot[],
): void {
  if (protectedIds.size === 0)
    return
  const remainingIds = new Set(entries.map(entry => entry.id))
  for (const entryId of protectedIds) {
    if (!remainingIds.has(entryId))
      throw new ActiveReadingDeletionError(entryId)
  }
}
