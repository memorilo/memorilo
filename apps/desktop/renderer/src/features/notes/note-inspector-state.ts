import { useAtom } from 'jotai'
import { atomWithStorage } from 'jotai/utils'
import { useCallback, useMemo } from 'react'

const noteInspectorVisibleAtom = atomWithStorage(
  'memorilo.note-structure-visible.v1',
  false,
  undefined,
  { getOnInit: true },
)

const collapsedEntriesByNoteAtom = atomWithStorage<Readonly<Record<string, readonly string[]>>>(
  'memorilo.note-structure-collapsed.v1',
  {},
  undefined,
  { getOnInit: true },
)

export function useNoteInspectorVisibility() {
  return useAtom(noteInspectorVisibleAtom)
}

export function useNoteInspectorEntries(noteId: string): {
  collapsedEntryIds: ReadonlySet<string>
  toggleEntry: (entryId: string) => void
} {
  const [collapsedByNote, setCollapsedByNote] = useAtom(collapsedEntriesByNoteAtom)
  const collapsedIds = collapsedByNote[noteId]
  const collapsedEntryIds = useMemo(
    () => new Set(collapsedIds === undefined ? [] : collapsedIds),
    [collapsedIds],
  )
  const toggleEntry = useCallback((entryId: string) => {
    setCollapsedByNote((current) => {
      const next = new Set(current[noteId] === undefined ? [] : current[noteId])
      if (next.has(entryId))
        next.delete(entryId)
      else
        next.add(entryId)
      return { ...current, [noteId]: [...next] }
    })
  }, [noteId, setCollapsedByNote])
  return { collapsedEntryIds, toggleEntry }
}
