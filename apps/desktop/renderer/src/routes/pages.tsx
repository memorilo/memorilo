import type {
  DesktopNotePage,
  DesktopNoteSortDirection,
  DesktopNoteSortField,
  DesktopNoteSummary,
  RenameDesktopNoteInput,
  RenameDesktopNoteResult,
} from '@memorilo/desktop-preload'
import type { SortingState, VisibilityState } from '@tanstack/react-table'
import type { Cause } from 'effect'
import type { InfiniteData } from 'effect-query'
import * as stylex from '@stylexjs/stylex'
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { createColumnHelper, flexRender, getCoreRowModel, useReactTable } from '@tanstack/react-table'
import { useVirtualizer } from '@tanstack/react-virtual'
import { Effect, Layer } from 'effect'
import { createEffectQuery } from 'effect-query'
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  Ellipsis,
  FileText,
  LoaderCircle,
  TriangleAlert,
} from 'lucide-react'
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'

import { usePageTitlebar } from '../components/page-titlebar'
import { pagesRouteStyles } from './-pages.stylex'

const pageSize = 100
const rowHeight = 46
const notesQueryKey = ['notes'] as const
const effectQuery = createEffectQuery(Layer.empty)
const columnHelper = createColumnHelper<DesktopNoteSummary>()
const columnIds = ['title', 'createdAt', 'updatedAt'] as const
const columnLabels: Record<ColumnId, string> = {
  createdAt: 'Created',
  title: 'Title',
  updatedAt: 'Modified',
}
const dateFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short',
})

type ColumnId = typeof columnIds[number]

function estimateRowSize() {
  return rowHeight
}

function resolveActiveSort(sorting: SortingState): {
  sortBy: DesktopNoteSortField
  sortDirection: DesktopNoteSortDirection
} {
  const active = sorting[0]
  if (!active)
    throw new Error('Pages table must always have one active sort column')
  let sortBy: DesktopNoteSortField
  switch (active.id) {
    case 'createdAt':
    case 'title':
    case 'updatedAt':
      sortBy = active.id
      break
    default:
      throw new Error(`Unknown Pages sort column: ${active.id}`)
  }
  return { sortBy, sortDirection: active.desc ? 'desc' : 'asc' }
}

function notesQueryOptions(sortBy: DesktopNoteSortField, sortDirection: DesktopNoteSortDirection) {
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
      pageSize,
      sortBy,
      sortDirection,
    })),
    queryKey: [...notesQueryKey, sortBy, sortDirection] as const,
  })
}

function renameNoteMutationOptions() {
  return effectQuery.mutationOptions<
    RenameDesktopNoteResult,
    Cause.UnknownError,
    never,
    RenameDesktopNoteInput
  >({
    mutationFn: input => Effect.tryPromise(() => window.desktop.renameNote(input)),
  })
}

function updateRenamedNote(
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

function columnStyle(columnId: string) {
  switch (columnId) {
    case 'title':
      return pagesRouteStyles.titleColumn
    case 'createdAt':
      return pagesRouteStyles.createdColumn
    case 'updatedAt':
      return pagesRouteStyles.dateColumn
    default:
      throw new Error(`Unknown Pages table column: ${columnId}`)
  }
}

function noteCountLabel(totalItems: number) {
  return `${totalItems.toLocaleString()} ${totalItems === 1 ? 'note' : 'notes'}`
}

function EditableTitleCell({
  note,
  onRename,
}: {
  note: DesktopNoteSummary
  onRename: (input: RenameDesktopNoteInput) => Promise<RenameDesktopNoteResult>
}) {
  const [draft, setDraft] = useState(note.title)
  const [editing, setEditing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useLayoutEffect(() => {
    if (!editing)
      return
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [editing])

  const cancel = useCallback(() => {
    if (saving)
      return
    setDraft(note.title)
    setError(null)
    setEditing(false)
  }, [note.title, saving])

  const commit = useCallback(async () => {
    if (saving)
      return
    const title = draft.trim()
    if (title.length === 0) {
      setError('Note title cannot be empty')
      inputRef.current?.focus()
      inputRef.current?.select()
      return
    }
    if (title === note.title) {
      setDraft(title)
      setError(null)
      setEditing(false)
      return
    }

    setSaving(true)
    setError(null)
    try {
      const result = await onRename({ noteId: note.id, title })
      if (result.status === 'duplicate-title') {
        setError('A Note with this title already exists')
        requestAnimationFrame(() => {
          inputRef.current?.focus()
          inputRef.current?.select()
        })
        return
      }
      setDraft(result.note.title)
      setEditing(false)
    }
    catch {
      setError('Couldn’t rename Note')
      requestAnimationFrame(() => {
        inputRef.current?.focus()
        inputRef.current?.select()
      })
    }
    finally {
      setSaving(false)
    }
  }, [draft, note.id, note.title, onRename, saving])

  if (!editing) {
    return (
      <button
        {...stylex.props(pagesRouteStyles.titleEditButton)}
        aria-label={`Rename Note: ${note.title}`}
        title="Rename Note"
        type="button"
        onClick={() => {
          setDraft(note.title)
          setError(null)
          setEditing(true)
        }}
      >
        {note.title}
      </button>
    )
  }

  return (
    <div {...stylex.props(pagesRouteStyles.titleEditor)}>
      <input
        ref={inputRef}
        {...stylex.props(pagesRouteStyles.titleInput)}
        aria-busy={saving}
        aria-invalid={error !== null}
        aria-label={error ?? `Title for ${note.title}`}
        readOnly={saving}
        title={error ?? 'Rename Note'}
        value={draft}
        onBlur={() => {
          if (saving)
            return
          if (draft.trim().length === 0)
            cancel()
          else
            void commit()
        }}
        onChange={(event) => {
          setDraft(event.target.value)
          if (event.target.value.trim().length > 0)
            setError(null)
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault()
            void commit()
          }
          else if (event.key === 'Escape') {
            event.preventDefault()
            cancel()
          }
        }}
      />
      {error
        ? <span {...stylex.props(pagesRouteStyles.visuallyHidden)} role="status">{error}</span>
        : null}
    </div>
  )
}

function createColumns(onRename: (input: RenameDesktopNoteInput) => Promise<RenameDesktopNoteResult>) {
  return [
    columnHelper.accessor('title', {
      cell: info => <EditableTitleCell note={info.row.original} onRename={onRename} />,
      header: 'Title',
      sortDescFirst: false,
    }),
    columnHelper.accessor('createdAt', {
      cell: info => dateFormatter.format(info.getValue()),
      header: 'Created',
      sortDescFirst: true,
    }),
    columnHelper.accessor('updatedAt', {
      cell: info => dateFormatter.format(info.getValue()),
      header: 'Modified',
      sortDescFirst: true,
    }),
  ]
}

function PagesViewMenu({
  columnVisibility,
  onToggleColumn,
}: {
  columnVisibility: VisibilityState
  onToggleColumn: (columnId: ColumnId) => void
}) {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const visibleCount = columnIds.filter(columnId => columnVisibility[columnId] !== false).length

  const showMenu = useCallback(async () => {
    const trigger = triggerRef.current
    if (!trigger)
      throw new Error('Pages view menu trigger is unavailable')
    const bounds = trigger.getBoundingClientRect()
    setOpen(true)
    try {
      const selection = await window.desktop.showColumnVisibilityMenu({
        anchor: {
          x: Math.round(bounds.left),
          y: Math.round(bounds.bottom + 4),
        },
        columns: columnIds.map(columnId => ({
          canToggle: columnVisibility[columnId] === false || visibleCount > 1,
          id: columnId,
          label: columnLabels[columnId],
          visible: columnVisibility[columnId] !== false,
        })),
      })
      if (!selection)
        return
      switch (selection.columnId) {
        case 'createdAt':
        case 'title':
        case 'updatedAt':
          onToggleColumn(selection.columnId)
          break
        default:
          throw new Error(`Native menu returned an unknown Pages column: ${selection.columnId}`)
      }
    }
    catch (error) {
      console.error('Failed to show the Pages column visibility menu', error)
    }
    finally {
      setOpen(false)
    }
  }, [columnVisibility, onToggleColumn, visibleCount])

  return (
    <div {...stylex.props(pagesRouteStyles.viewMenuRoot)}>
      <button
        ref={triggerRef}
        {...stylex.props(pagesRouteStyles.viewMenuButton)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="View options"
        title="View options"
        type="button"
        onClick={() => void showMenu()}
      >
        <Ellipsis aria-hidden="true" size={19} strokeWidth={2.1} />
        <ChevronDown
          {...stylex.props(pagesRouteStyles.viewMenuChevron, open && pagesRouteStyles.viewMenuChevronOpen)}
          aria-hidden="true"
          size={15}
          strokeWidth={2}
        />
      </button>
    </div>
  )
}

function PagesRoute() {
  const scrollElementRef = useRef<HTMLDivElement>(null)
  const queryClient = useQueryClient()
  const [sorting, setSorting] = useState<SortingState>(() => [{ desc: true, id: 'updatedAt' }])
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({})
  const { sortBy, sortDirection } = resolveActiveSort(sorting)
  const notesQuery = useInfiniteQuery(notesQueryOptions(sortBy, sortDirection))
  const { mutateAsync: mutateRenameNote } = useMutation({
    ...renameNoteMutationOptions(),
    onSuccess: (result) => {
      if (result.status === 'duplicate-title')
        return
      queryClient.setQueriesData<InfiniteData<DesktopNotePage>>(
        { queryKey: notesQueryKey },
        data => updateRenamedNote(data, result.note),
      )
      void queryClient.invalidateQueries({ queryKey: notesQueryKey })
    },
  })
  const renameNote = useCallback(
    (input: RenameDesktopNoteInput) => mutateRenameNote(input),
    [mutateRenameNote],
  )
  const columns = useMemo(() => createColumns(renameNote), [renameNote])
  const notes = useMemo(() => notesQuery.data
    ? notesQuery.data.pages.flatMap(page => [...page.items])
    : [], [notesQuery.data])
  const firstPage = notesQuery.data?.pages[0]
  if (notesQuery.data && !firstPage)
    throw new Error('The Notes infinite query returned no first page')

  const table = useReactTable({
    columns,
    data: notes,
    enableSortingRemoval: false,
    getCoreRowModel: getCoreRowModel(),
    getRowId: note => note.id,
    manualSorting: true,
    onColumnVisibilityChange: setColumnVisibility,
    onSortingChange: setSorting,
    state: { columnVisibility, sorting },
  })
  const rows = table.getRowModel().rows
  const visibleColumnCount = table.getVisibleLeafColumns().length
  if (visibleColumnCount < 1)
    throw new Error('Pages table must keep at least one visible column')

  const toggleColumnVisibility = useCallback((columnId: ColumnId) => {
    setColumnVisibility((current) => {
      const visible = current[columnId] !== false
      const visibleCount = columnIds.filter(id => current[id] !== false).length
      if (visible && visibleCount === 1)
        return current
      return { ...current, [columnId]: !visible }
    })
  }, [])
  const titlebar = useMemo(() => ({
    title: 'Pages',
    trailing: (
      <PagesViewMenu
        columnVisibility={columnVisibility}
        onToggleColumn={toggleColumnVisibility}
      />
    ),
  }), [columnVisibility, toggleColumnVisibility])
  usePageTitlebar(titlebar)

  const {
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isFetchNextPageError,
  } = notesQuery
  const virtualCount = rows.length + (hasNextPage ? 1 : 0)
  const getVirtualRowKey = useCallback((index: number) => {
    const row = rows[index]
    if (row)
      return row.id
    if (index === rows.length && hasNextPage)
      return 'load-next-note-page'
    throw new RangeError(`Virtual Note row ${index} is outside the table`)
  }, [hasNextPage, rows])
  const rowVirtualizer = useVirtualizer({
    count: virtualCount,
    estimateSize: estimateRowSize,
    getItemKey: getVirtualRowKey,
    getScrollElement: () => scrollElementRef.current,
    overscan: 10,
  })
  const virtualRows = rowVirtualizer.getVirtualItems()
  const lastVirtualRow = virtualRows.at(-1)

  useEffect(() => {
    const scrollElement = scrollElementRef.current
    if (scrollElement)
      scrollElement.scrollTop = 0
  }, [sortBy, sortDirection])

  useEffect(() => {
    if (!lastVirtualRow
      || lastVirtualRow.index !== rows.length
      || !hasNextPage
      || isFetchingNextPage
      || isFetchNextPageError) {
      return
    }
    void fetchNextPage()
  }, [
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isFetchNextPageError,
    lastVirtualRow,
    rows.length,
  ])

  const totalItems = firstPage?.totalItems

  return (
    <main {...stylex.props(pagesRouteStyles.page)} aria-label="Pages">
      <section {...stylex.props(pagesRouteStyles.content)} aria-label="Note library">
        <div {...stylex.props(pagesRouteStyles.summary)}>
          <p {...stylex.props(pagesRouteStyles.resultCount)} aria-live="polite">
            {totalItems === undefined ? 'Notes' : noteCountLabel(totalItems)}
          </p>
        </div>

        <div {...stylex.props(pagesRouteStyles.tableRegion)}>
          <div ref={scrollElementRef} {...stylex.props(pagesRouteStyles.tableViewport)}>
            <table
              {...stylex.props(pagesRouteStyles.table)}
              aria-busy={isFetchingNextPage}
              aria-rowcount={totalItems}
            >
              <thead {...stylex.props(pagesRouteStyles.tableHead)}>
                {table.getHeaderGroups().map(headerGroup => (
                  <tr key={headerGroup.id} {...stylex.props(pagesRouteStyles.headerRow)}>
                    {headerGroup.headers.map((header) => {
                      const sorted = header.column.getIsSorted()
                      const label = columnLabels[header.column.id as ColumnId]
                      if (!label)
                        throw new Error(`Unknown Pages table header: ${header.column.id}`)
                      return (
                        <th
                          key={header.id}
                          {...stylex.props(
                            pagesRouteStyles.headerCell,
                            columnStyle(header.column.id),
                          )}
                          aria-sort={sorted === 'asc' ? 'ascending' : sorted === 'desc' ? 'descending' : 'none'}
                          scope="col"
                        >
                          <button
                            {...stylex.props(
                              pagesRouteStyles.headerButton,
                              sorted !== false && pagesRouteStyles.headerButtonSorted,
                            )}
                            aria-label={`Sort by ${label}${sorted ? `, currently ${sorted === 'asc' ? 'ascending' : 'descending'}` : ''}`}
                            title={`Sort by ${label}`}
                            type="button"
                            onClick={header.column.getToggleSortingHandler()}
                          >
                            <span>
                              {header.isPlaceholder
                                ? null
                                : flexRender(header.column.columnDef.header, header.getContext())}
                            </span>
                            {sorted === 'asc'
                              ? <ArrowUp {...stylex.props(pagesRouteStyles.sortIcon)} aria-hidden="true" />
                              : sorted === 'desc'
                                ? <ArrowDown {...stylex.props(pagesRouteStyles.sortIcon)} aria-hidden="true" />
                                : null}
                          </button>
                        </th>
                      )
                    })}
                  </tr>
                ))}
              </thead>

              {notesQuery.isPending
                ? (
                    <tbody {...stylex.props(pagesRouteStyles.statusBody)}>
                      <tr {...stylex.props(pagesRouteStyles.statusRow)}>
                        <td {...stylex.props(pagesRouteStyles.statusCell)} colSpan={visibleColumnCount}>
                          <LoaderCircle
                            {...stylex.props(pagesRouteStyles.statusIcon, pagesRouteStyles.loadingIcon)}
                            aria-hidden="true"
                            strokeWidth={1.7}
                          />
                          <span role="status">Loading notes…</span>
                        </td>
                      </tr>
                    </tbody>
                  )
                : notesQuery.isError && rows.length === 0
                  ? (
                      <tbody {...stylex.props(pagesRouteStyles.statusBody)}>
                        <tr {...stylex.props(pagesRouteStyles.statusRow)}>
                          <td {...stylex.props(pagesRouteStyles.statusCell)} colSpan={visibleColumnCount}>
                            <TriangleAlert {...stylex.props(pagesRouteStyles.errorIcon)} aria-hidden="true" strokeWidth={1.7} />
                            <span>Couldn’t load notes</span>
                            <button
                              {...stylex.props(pagesRouteStyles.retryButton)}
                              type="button"
                              onClick={() => void notesQuery.refetch()}
                            >
                              Try Again
                            </button>
                          </td>
                        </tr>
                      </tbody>
                    )
                  : rows.length === 0
                    ? (
                        <tbody {...stylex.props(pagesRouteStyles.statusBody)}>
                          <tr {...stylex.props(pagesRouteStyles.statusRow)}>
                            <td {...stylex.props(pagesRouteStyles.statusCell)} colSpan={visibleColumnCount}>
                              <FileText {...stylex.props(pagesRouteStyles.statusIcon)} aria-hidden="true" strokeWidth={1.5} />
                              <span>No notes</span>
                            </td>
                          </tr>
                        </tbody>
                      )
                    : (
                        <tbody
                          {...stylex.props(pagesRouteStyles.tableBody)}
                          style={{ height: rowVirtualizer.getTotalSize() }}
                        >
                          {virtualRows.map((virtualRow) => {
                            const row = rows[virtualRow.index]
                            if (!row) {
                              if (virtualRow.index !== rows.length || !hasNextPage)
                                throw new RangeError(`Virtual Note row ${virtualRow.index} is outside the table`)
                              return (
                                <tr
                                  key={virtualRow.key}
                                  {...stylex.props(pagesRouteStyles.loadingRow)}
                                  style={{ transform: `translateY(${virtualRow.start}px)` }}
                                >
                                  <td {...stylex.props(pagesRouteStyles.loadingCell)} colSpan={visibleColumnCount}>
                                    {isFetchNextPageError
                                      ? (
                                          <button
                                            {...stylex.props(pagesRouteStyles.retryButton)}
                                            type="button"
                                            onClick={() => void fetchNextPage()}
                                          >
                                            Try Again
                                          </button>
                                        )
                                      : (
                                          <>
                                            <LoaderCircle
                                              {...stylex.props(pagesRouteStyles.loadingMoreIcon, pagesRouteStyles.loadingIcon)}
                                              aria-hidden="true"
                                              strokeWidth={1.8}
                                            />
                                            <span>Loading more…</span>
                                          </>
                                        )}
                                  </td>
                                </tr>
                              )
                            }
                            return (
                              <tr
                                key={row.id}
                                {...stylex.props(pagesRouteStyles.tableRow)}
                                aria-rowindex={virtualRow.index + 2}
                                style={{ transform: `translateY(${virtualRow.start}px)` }}
                              >
                                {row.getVisibleCells().map(cell => (
                                  <td
                                    key={cell.id}
                                    {...stylex.props(
                                      pagesRouteStyles.tableCell,
                                      columnStyle(cell.column.id),
                                      cell.column.id === 'title' && pagesRouteStyles.titleCell,
                                    )}
                                  >
                                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                                  </td>
                                ))}
                              </tr>
                            )
                          })}
                        </tbody>
                      )}
            </table>
          </div>
        </div>
      </section>
    </main>
  )
}

export const Route = createFileRoute('/pages')({ component: PagesRoute })
