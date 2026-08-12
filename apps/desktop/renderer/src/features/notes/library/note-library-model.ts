import type {
  DesktopNoteFavoriteState,
  DesktopNotePage,
  DesktopNoteSortDirection,
  DesktopNoteSortField,
  DesktopNoteSummary,
  RenameDesktopNoteInput,
  RenameDesktopNoteResult,
  SetDesktopNoteFavoriteInput,
} from '@memorilo/desktop-preload'
import type { SortingState } from '@tanstack/react-table'
import type { Cause } from 'effect'
import type { InfiniteData } from 'effect-query'
import type { TFunction } from 'i18next'
import { Effect, Layer } from 'effect'
import { createEffectQuery } from 'effect-query'
import { noteQueryKeys } from '../query-keys'

export const noteLibraryPageSize = 100
export const noteLibraryColumnIds = ['title', 'createdAt', 'updatedAt'] as const
export type NoteLibraryColumnId = typeof noteLibraryColumnIds[number]
const effectQuery = createEffectQuery(Layer.empty)

export function noteLibraryColumnLabel(
  columnId: NoteLibraryColumnId,
  t: TFunction,
): string {
  switch (columnId) {
    case 'createdAt':
      return t('createdColumn')
    case 'title':
      return t('titleColumn')
    case 'updatedAt':
      return t('modifiedColumn')
  }
}

export function resolveNoteLibrarySort(sorting: SortingState): {
  sortBy: DesktopNoteSortField
  sortDirection: DesktopNoteSortDirection
} {
  const active = sorting[0]
  if (!active)
    throw new Error('Note library table must always have one active sort column')
  switch (active.id) {
    case 'createdAt':
    case 'title':
    case 'updatedAt':
      return { sortBy: active.id, sortDirection: active.desc ? 'desc' : 'asc' }
    default:
      throw new Error(`Unknown Note library sort column: ${active.id}`)
  }
}

export function noteLibraryQueryOptions(
  sortBy: DesktopNoteSortField,
  sortDirection: DesktopNoteSortDirection,
) {
  return effectQuery.infiniteQueryOptions<
    DesktopNotePage,
    Cause.UnknownError,
    never,
    InfiniteData<DesktopNotePage>,
    number
  >({
    getNextPageParam: lastPage => lastPage.page < lastPage.totalPages
      ? lastPage.page + 1
      : undefined,
    initialPageParam: 1,
    queryFn: ({ pageParam }) => Effect.tryPromise(() => window.desktop.listNotes({
      page: pageParam,
      pageSize: noteLibraryPageSize,
      sortBy,
      sortDirection,
    })),
    queryKey: [...noteQueryKeys.lists, sortBy, sortDirection] as const,
  })
}

export function setNoteFavoriteMutationOptions() {
  return effectQuery.mutationOptions<
    DesktopNoteFavoriteState,
    Cause.UnknownError,
    never,
    SetDesktopNoteFavoriteInput
  >({
    mutationFn: input => Effect.tryPromise(() => window.desktop.setNoteFavorite(input)),
  })
}

export function renameNoteMutationOptions() {
  return effectQuery.mutationOptions<
    RenameDesktopNoteResult,
    Cause.UnknownError,
    never,
    RenameDesktopNoteInput
  >({
    mutationFn: input => Effect.tryPromise(() => window.desktop.renameNote(input)),
  })
}

export function updateRenamedNoteCache(
  data: InfiniteData<DesktopNotePage> | undefined,
  renamed: DesktopNoteSummary,
): InfiniteData<DesktopNotePage> | undefined {
  if (!data)
    return data
  let changed = false
  const pages = data.pages.map((page) => {
    let pageChanged = false
    const items = page.items.map((note) => {
      if (note.id !== renamed.id)
        return note
      changed = true
      pageChanged = true
      return renamed
    })
    return pageChanged ? { ...page, items } : page
  })
  return changed ? { ...data, pages } : data
}

export function updateFavoriteNoteCache(
  data: InfiniteData<DesktopNotePage> | undefined,
  state: DesktopNoteFavoriteState,
): InfiniteData<DesktopNotePage> | undefined {
  if (!data)
    return data
  let changed = false
  const pages = data.pages.map((page) => {
    let pageChanged = false
    const items = page.items.map((note) => {
      if (note.id !== state.noteId)
        return note
      changed = true
      pageChanged = true
      return { ...note, favorite: state.favorite }
    })
    return pageChanged ? { ...page, items } : page
  })
  return changed ? { ...data, pages } : data
}
