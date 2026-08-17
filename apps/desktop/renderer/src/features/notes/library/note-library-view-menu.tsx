import type { VisibilityState } from '@tanstack/react-table'
import type { TFunction } from 'i18next'
import type { NoteLibraryColumnId } from './note-library-model'
import { Button, DropdownMenu } from '@memorilo/ui'
import * as stylex from '@stylexjs/stylex'
import { Check, ChevronDown, Ellipsis } from 'lucide-react'
import { useState } from 'react'
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
  const visibleCount = noteLibraryColumnIds.filter(
    columnId => columnVisibility[columnId] !== false,
  ).length

  return (
    <div {...stylex.props(pagesRouteStyles.viewMenuRoot)}>
      <DropdownMenu.Root open={open} onOpenChange={setOpen}>
        <DropdownMenu.Trigger asChild>
          <Button
            aria-label={t('viewOptions')}
            data-window-no-drag=""
            variant="titlebar"
            xstyle={pagesRouteStyles.viewMenuButton}
            title={t('viewOptions')}
          >
            <Ellipsis aria-hidden="true" size={19} strokeWidth={2.1} />
            <ChevronDown
              {...stylex.props(pagesRouteStyles.viewMenuChevron, open && pagesRouteStyles.viewMenuChevronOpen)}
              aria-hidden="true"
              size={15}
              strokeWidth={2}
            />
          </Button>
        </DropdownMenu.Trigger>
        <DropdownMenu.Portal>
          <DropdownMenu.Content align="end" aria-label={t('viewOptions')}>
            {noteLibraryColumnIds.map((columnId) => {
              const visible = columnVisibility[columnId] !== false
              const canToggle = !visible || visibleCount > 1
              return (
                <DropdownMenu.Item
                  key={columnId}
                  aria-checked={visible}
                  disabled={!canToggle}
                  role="menuitemcheckbox"
                  onSelect={() => {
                    if (canToggle)
                      onToggleColumn(columnId)
                  }}
                >
                  <span>{noteLibraryColumnLabel(columnId, t)}</span>
                  {visible ? <Check aria-hidden="true" size={15} strokeWidth={2} /> : null}
                </DropdownMenu.Item>
              )
            })}
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    </div>
  )
}
