import type { CreateDesktopNoteInput, DesktopNote, DesktopNoteSearchHit } from '@memorilo/desktop-preload'
import type { Cause } from 'effect'
import type { TFunction } from 'i18next'
import type { PaletteCommand } from '../../shared/command-palette'
import type {
  CommandPaletteNavigation,
  CommandPaletteSearchProjection,
} from './command-palette-search-model'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Effect, Layer } from 'effect'
import { createEffectQuery } from 'effect-query'
import { useCallback, useDeferredValue, useMemo, useRef } from 'react'
import { defaultTopicId } from '../../features/notes/note-runtime'
import { router } from '../router'
import { projectCommandPaletteSearch } from './command-palette-search-model'

const effectQuery = createEffectQuery(Layer.empty)
const searchLimit = 20

function noteSearchQueryOptions(query: string, enabled: boolean) {
  return effectQuery.queryOptions<readonly DesktopNoteSearchHit[], Cause.UnknownError, never>({
    enabled,
    queryFn: () => Effect.tryPromise(() => window.desktop.searchNotes({ limit: searchLimit, query })),
    queryKey: ['memorilo-search', query] as const,
    staleTime: 15_000,
  })
}

function createNoteMutationOptions() {
  return effectQuery.mutationOptions<DesktopNote, Cause.UnknownError, never, CreateDesktopNoteInput>({
    mutationFn: input => Effect.tryPromise(() => window.desktop.createNote(input)),
  })
}

async function openStoredNote(stored: DesktopNote): Promise<void> {
  if (stored.kind === 'journal') {
    await router.navigate({ search: { date: stored.journalDate }, to: '/journals' })
    return
  }
  await router.navigate({
    params: { noteId: stored.id, topicId: defaultTopicId(stored) },
    to: '/note/$noteId/$topicId',
  })
}

interface CommandPaletteSearchInput {
  actionPending: boolean
  commands: readonly PaletteCommand[]
  open: boolean
  query: string
  selectedId: string | null
  t: TFunction
}

interface CommandPaletteSearch extends CommandPaletteSearchProjection {
  createNoteFailed: boolean
  resetCreateNote: () => void
}

export function useCommandPaletteSearch({
  actionPending,
  commands,
  open,
  query,
  selectedId,
  t,
}: CommandPaletteSearchInput): CommandPaletteSearch {
  const createdNoteRef = useRef<{ note: DesktopNote, title: string } | null>(null)
  const trimmedQuery = query.trim()
  const normalizedQuery = trimmedQuery.toLocaleLowerCase()
  const deferredQuery = useDeferredValue(normalizedQuery)
  const noteSearch = useQuery(noteSearchQueryOptions(deferredQuery, open && deferredQuery.length > 0))
  const {
    isError: createNoteFailed,
    isPending: createNotePending,
    mutateAsync: mutateCreateNote,
    reset: resetCreateNote,
  } = useMutation(createNoteMutationOptions())
  const navigation = useMemo<CommandPaletteNavigation>(() => ({
    openJournal: date => router.navigate({ search: { date }, to: '/journals' }),
    openNote: async (noteId: string) => openStoredNote(await window.desktop.getNote({ noteId })),
    openTopic: ({ blockId, noteId, topicId }: {
      blockId: string | null
      noteId: string
      topicId: string
    }) => router.navigate({
      params: { noteId, topicId },
      search: blockId === null ? {} : { focus: blockId },
      to: '/note/$noteId/$topicId',
    }),
  }), [])
  const createNote = useCallback(async (title: string) => {
    let created = createdNoteRef.current
    if (created === null || created.title !== title) {
      created = {
        note: await mutateCreateNote({ initialHeading: title, title }),
        title,
      }
      createdNoteRef.current = created
    }
    await openStoredNote(created.note)
  }, [mutateCreateNote])
  const projection = useMemo(() => projectCommandPaletteSearch({
    commands,
    createNote,
    createNotePending: createNotePending || actionPending,
    deferredQuery,
    hits: noteSearch.data,
    navigation,
    normalizedQuery,
    searchError: noteSearch.isError,
    searchFetching: noteSearch.isPending || noteSearch.isFetching,
    selectedId,
    t,
    trimmedQuery,
  }), [
    actionPending,
    commands,
    createNote,
    createNotePending,
    deferredQuery,
    navigation,
    normalizedQuery,
    noteSearch.data,
    noteSearch.isError,
    noteSearch.isFetching,
    noteSearch.isPending,
    selectedId,
    t,
    trimmedQuery,
  ])

  return { ...projection, createNoteFailed, resetCreateNote }
}
