import type { NoteEntrySnapshot } from '@memorilo/editor'

interface VisibleNoteEntry {
  depth: number
  entry: NoteEntrySnapshot
  hasChildren: boolean
}

export function projectVisibleNoteEntries(
  entries: readonly NoteEntrySnapshot[],
  collapsedEntryIds: ReadonlySet<string>,
): readonly VisibleNoteEntry[] {
  const entriesById = new Map<string, NoteEntrySnapshot>()
  const parentsWithChildren = new Set<string>()
  const depths = new Map<string, number>()

  for (const entry of entries) {
    if (entriesById.has(entry.id))
      throw new Error(`Duplicate Note entry id: ${entry.id}`)
    entriesById.set(entry.id, entry)
    if (entry.parentId !== null)
      parentsWithChildren.add(entry.parentId)
  }

  const depthOf = (entry: NoteEntrySnapshot, visiting: Set<string>): number => {
    const cachedDepth = depths.get(entry.id)
    if (cachedDepth !== undefined)
      return cachedDepth
    if (visiting.has(entry.id))
      throw new Error(`Cycle detected at Note entry ${entry.id}`)

    visiting.add(entry.id)
    const depth = entry.parentId === null
      ? 0
      : (() => {
          const parent = entriesById.get(entry.parentId)
          if (!parent)
            throw new Error(`Note entry ${entry.id} has unknown parent ${entry.parentId}`)
          return depthOf(parent, visiting) + 1
        })()
    visiting.delete(entry.id)
    depths.set(entry.id, depth)
    return depth
  }

  for (const entry of entries)
    depthOf(entry, new Set())

  return entries.flatMap((entry) => {
    let parentId = entry.parentId
    while (parentId !== null) {
      if (collapsedEntryIds.has(parentId))
        return []
      const parent = entriesById.get(parentId)
      if (!parent)
        throw new Error(`Note entry ${entry.id} has unknown parent ${parentId}`)
      parentId = parent.parentId
    }
    const depth = depths.get(entry.id)
    if (depth === undefined)
      throw new Error(`Note entry ${entry.id} does not have a projected depth`)
    return [{ depth, entry, hasChildren: parentsWithChildren.has(entry.id) }]
  })
}

/** Returns the adjacent item in the current visible order, clamping at either end. */
export function selectAdjacentVisibleId(
  visibleIds: readonly string[],
  currentId: string,
  direction: -1 | 1,
): string | undefined {
  if (visibleIds.length === 0)
    return undefined
  const currentIndex = visibleIds.indexOf(currentId)
  const nextIndex = currentIndex < 0
    ? direction === 1 ? 0 : visibleIds.length - 1
    : Math.max(0, Math.min(visibleIds.length - 1, currentIndex + direction))
  return visibleIds[nextIndex]
}
