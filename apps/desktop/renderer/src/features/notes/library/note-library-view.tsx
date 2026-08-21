import type {
  DesktopNoteFavoriteState,
  DesktopNoteSummary,
  RenameDesktopNoteInput,
  RenameDesktopNoteResult,
  SetDesktopNoteFavoriteInput,
} from '@memorilo/desktop-api'
import type { SortingState, VisibilityState } from '@tanstack/react-table'
import type { TFunction } from 'i18next'
import type { NoteLibraryColumnId } from './note-library-model'
import { Button } from '@memorilo/ui'
import * as stylex from '@stylexjs/stylex'
import { useInfiniteQuery } from '@tanstack/react-query'
import { createColumnHelper, flexRender, getCoreRowModel, useReactTable } from '@tanstack/react-table'
import { useVirtualizer } from '@tanstack/react-virtual'
import dayjs from 'dayjs'
import {
  ArrowDown,
  ArrowUp,
  FileText,
  FileUp,
  LoaderCircle,
  TriangleAlert,
} from 'lucide-react'
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useTranslation } from 'react-i18next'

import { usePageTitlebar } from '../../../shared/page-titlebar'
import { PagesTitleCell } from './note-library-columns'
import {
  noteLibraryColumnIds,
  noteLibraryColumnLabel,
  noteLibraryQueryOptions,
  resolveNoteLibrarySort,
} from './note-library-model'
import { noteLibraryPageStyles as pagesRouteStyles } from './note-library-page.stylex'
import { NoteLibraryViewMenu } from './note-library-view-menu'

const rowHeight = 46
const columnHelper = createColumnHelper<DesktopNoteSummary>()

export interface NoteLibraryCommands {
  favorite: (input: SetDesktopNoteFavoriteInput) => Promise<DesktopNoteFavoriteState>
  open: (noteId: string) => Promise<void>
  rename: (input: RenameDesktopNoteInput) => Promise<RenameDesktopNoteResult>
  importMarkdown: () => void
}

function estimateRowSize() {
  return rowHeight
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

function noteCountLabel(totalItems: number, t: TFunction) {
  return t('noteCount', { count: totalItems })
}

function formatDate(value: unknown): string {
  return dayjs(value as Date).format('lll')
}

function createPagesColumns(commands: NoteLibraryCommands, t: TFunction) {
  return [
    columnHelper.accessor('title', {
      cell: info => <PagesTitleCell commands={commands} note={info.row.original} t={t} />,
      header: t('titleColumn'),
      sortDescFirst: false,
    }),
    columnHelper.accessor('createdAt', {
      cell: info => formatDate(info.getValue()),
      header: t('createdColumn'),
      sortDescFirst: true,
    }),
    columnHelper.accessor('updatedAt', {
      cell: info => formatDate(info.getValue()),
      header: t('modifiedColumn'),
      sortDescFirst: true,
    }),
  ]
}

export function NoteLibraryView({ commands }: { commands: NoteLibraryCommands }) {
  const { t } = useTranslation('pages')
  const scrollElementRef = useRef<HTMLDivElement>(null)
  const [sorting, setSorting] = useState<SortingState>(() => [{ desc: true, id: 'updatedAt' }])
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({})
  const { sortBy, sortDirection } = resolveNoteLibrarySort(sorting)
  const notesQuery = useInfiniteQuery(noteLibraryQueryOptions(sortBy, sortDirection))
  const columns = useMemo(() => createPagesColumns(commands, t), [commands, t])
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

  const toggleColumnVisibility = useCallback((columnId: NoteLibraryColumnId) => {
    setColumnVisibility((current) => {
      const visible = current[columnId] !== false
      const visibleCount = noteLibraryColumnIds.filter(id => current[id] !== false).length
      if (visible && visibleCount === 1)
        return current
      return { ...current, [columnId]: !visible }
    })
  }, [])
  const titlebar = useMemo(() => ({
    title: t('pageLabel'),
    trailing: (
      <>
        <Button aria-label={t('importMarkdown')} data-window-no-drag="" title={t('importMarkdown')} variant="titlebar" onClick={commands.importMarkdown}>
          <FileUp aria-hidden="true" size={17} strokeWidth={1.9} />
        </Button>
        <NoteLibraryViewMenu
          columnVisibility={columnVisibility}
          onToggleColumn={toggleColumnVisibility}
          t={t}
        />
      </>
    ),
  }), [commands.importMarkdown, columnVisibility, t, toggleColumnVisibility])
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
    <main {...stylex.props(pagesRouteStyles.page)} aria-label={t('pageLabel')}>
      <section {...stylex.props(pagesRouteStyles.content)} aria-label={t('libraryLabel')}>
        <div {...stylex.props(pagesRouteStyles.summary)}>
          <p {...stylex.props(pagesRouteStyles.resultCount)} aria-live="polite">
            {totalItems === undefined ? t('notes') : noteCountLabel(totalItems, t)}
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
                      const label = noteLibraryColumnLabel(
                        header.column.id as NoteLibraryColumnId,
                        t,
                      )
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
                            aria-label={sorted
                              ? t('sortByCurrent', { direction: sorted === 'asc' ? t('ascending', { ns: 'common' }) : t('descending', { ns: 'common' }), label })
                              : t('sortBy', { label })}
                            title={t('sortBy', { label })}
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
                          <span role="status">{t('loadingNotes')}</span>
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
                            <span>{t('couldNotLoadNotes')}</span>
                            <button
                              {...stylex.props(pagesRouteStyles.retryButton)}
                              type="button"
                              onClick={() => void notesQuery.refetch()}
                            >
                              {t('tryAgain', { ns: 'common' })}
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
                              <span>{t('noNotes')}</span>
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
                                            {t('tryAgain', { ns: 'common' })}
                                          </button>
                                        )
                                      : (
                                          <>
                                            <LoaderCircle
                                              {...stylex.props(pagesRouteStyles.loadingMoreIcon, pagesRouteStyles.loadingIcon)}
                                              aria-hidden="true"
                                              strokeWidth={1.8}
                                            />
                                            <span>{t('loadingMore')}</span>
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
