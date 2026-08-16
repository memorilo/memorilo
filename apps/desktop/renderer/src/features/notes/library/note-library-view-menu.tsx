import type { VisibilityState } from '@tanstack/react-table'
import type { TFunction } from 'i18next'
import type { NoteLibraryColumnId } from './note-library-model'
import * as stylex from '@stylexjs/stylex'
import { ChevronDown, Ellipsis } from 'lucide-react'
import { useCallback, useRef, useState } from 'react'
import { desktopRequests } from '../../../shared/desktop-requests'
import { noteLibraryColumnIds, noteLibraryColumnLabel } from './note-library-model'
import { noteLibraryViewMenuStyles as pagesRouteStyles } from './note-library-view-menu.stylex'

export function NoteLibraryViewMenu({
  columnVisibility,
  onToggleColumn,
  t,
}: {
  columnVisibility: VisibilityState
  onToggleColumn: (columnId: NoteLibraryColumnId) => void
  t: TFunction
}) {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const visibleCount = noteLibraryColumnIds.filter(
    columnId => columnVisibility[columnId] !== false,
  ).length

  const showMenu = useCallback(async () => {
    const trigger = triggerRef.current
    if (!trigger)
      throw new Error('Note library view menu trigger is unavailable')
    const bounds = trigger.getBoundingClientRect()
    setOpen(true)
    try {
      const selection = await desktopRequests.showColumnVisibilityMenu({
        anchor: {
          x: Math.round(bounds.left),
          y: Math.round(bounds.bottom + 4),
        },
        columns: noteLibraryColumnIds.map(columnId => ({
          canToggle: columnVisibility[columnId] === false || visibleCount > 1,
          id: columnId,
          label: noteLibraryColumnLabel(columnId, t),
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
          throw new Error(`Native menu returned an unknown Note library column: ${selection.columnId}`)
      }
    }
    catch (error) {
      console.error('Failed to show the Note library column visibility menu', error)
    }
    finally {
      setOpen(false)
    }
  }, [columnVisibility, onToggleColumn, t, visibleCount])

  return (
    <div {...stylex.props(pagesRouteStyles.viewMenuRoot)}>
      <button
        ref={triggerRef}
        {...stylex.props(pagesRouteStyles.viewMenuButton)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={t('viewOptions')}
        title={t('viewOptions')}
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
