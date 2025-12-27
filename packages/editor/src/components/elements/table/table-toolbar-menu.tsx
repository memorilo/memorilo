import type { MouseEventHandler } from 'react'
import { Popover, PopoverContent, PopoverTrigger } from '@memorilo/components/ui/popover'
import { useTranslation } from 'react-i18next'
import { LuEllipsisVertical } from 'react-icons/lu'
import { TableToolbarButton } from './table-toolbar-button'

interface TableToolbarMenuProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onAlignLeft: MouseEventHandler<HTMLButtonElement>
  onAlignCenter: MouseEventHandler<HTMLButtonElement>
  onAlignRight: MouseEventHandler<HTMLButtonElement>
  onInsertRowAbove: MouseEventHandler<HTMLButtonElement>
  onInsertRowBelow: MouseEventHandler<HTMLButtonElement>
  onDeleteRow: MouseEventHandler<HTMLButtonElement>
  onInsertColLeft: MouseEventHandler<HTMLButtonElement>
  onInsertColRight: MouseEventHandler<HTMLButtonElement>
  onDeleteCol: MouseEventHandler<HTMLButtonElement>
}

export function TableToolbarMenu({
  open,
  onOpenChange,
  onAlignLeft,
  onAlignCenter,
  onAlignRight,
  onInsertRowAbove,
  onInsertRowBelow,
  onDeleteRow,
  onInsertColLeft,
  onInsertColRight,
  onDeleteCol,
}: TableToolbarMenuProps) {
  const { t } = useTranslation('app')

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <TableToolbarButton
          variant="icon"
          title={t('table.toolbar.settingsTitle')}
          onMouseDown={e => e.preventDefault()}
        >
          <LuEllipsisVertical />
        </TableToolbarButton>
      </PopoverTrigger>
      <PopoverContent className="table-menu-popover" side="bottom" align="start">
        <TableToolbarButton variant="menu" onMouseDown={onAlignLeft}>
          {t('table.menu.alignLeft')}
        </TableToolbarButton>
        <TableToolbarButton variant="menu" onMouseDown={onAlignCenter}>
          {t('table.menu.alignCenter')}
        </TableToolbarButton>
        <TableToolbarButton variant="menu" onMouseDown={onAlignRight}>
          {t('table.menu.alignRight')}
        </TableToolbarButton>

        <div className="table-menu-divider" />

        <TableToolbarButton variant="menu" onMouseDown={onInsertRowAbove}>
          {t('table.menu.insertRowAbove')}
        </TableToolbarButton>
        <TableToolbarButton variant="menu" onMouseDown={onInsertRowBelow}>
          {t('table.menu.insertRowBelow')}
        </TableToolbarButton>
        <TableToolbarButton variant="menu" danger onMouseDown={onDeleteRow}>
          {t('table.menu.deleteRow')}
        </TableToolbarButton>

        <div className="table-menu-divider" />

        <TableToolbarButton variant="menu" onMouseDown={onInsertColLeft}>
          {t('table.menu.insertColLeft')}
        </TableToolbarButton>
        <TableToolbarButton variant="menu" onMouseDown={onInsertColRight}>
          {t('table.menu.insertColRight')}
        </TableToolbarButton>
        <TableToolbarButton variant="menu" danger onMouseDown={onDeleteCol}>
          {t('table.menu.deleteCol')}
        </TableToolbarButton>
      </PopoverContent>
    </Popover>
  )
}
