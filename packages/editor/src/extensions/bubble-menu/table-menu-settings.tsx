import type { Editor } from '@tiptap/core'
import type { TableContext } from './table-menu-utils'
import { Button } from '@memorilo/components/ui/button'
import { Input } from '@memorilo/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@memorilo/components/ui/popover'
import { Switch } from '@memorilo/components/ui/switch'
import { Tooltip, TooltipContent, TooltipTrigger } from '@memorilo/components/ui/tooltip'
import { cn } from '@memorilo/utils'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { MdGridOn, MdSettings } from 'react-icons/md'
import { clamp, getTableContext, resizeTable, selectCell } from './table-menu-utils'

interface TableSettingsPopoverProps {
  editor: Editor
  tableContext: TableContext
}

const GRID_MAX = 10

export function TableSettingsPopover({ editor, tableContext }: TableSettingsPopoverProps) {
  const { t } = useTranslation('app')
  const [open, setOpen] = useState(false)
  const [rows, setRows] = useState(tableContext.rows)
  const [cols, setCols] = useState(tableContext.cols)
  const [withHeaderRow, setWithHeaderRow] = useState(tableContext.hasHeaderRow)
  const [hoveredSize, setHoveredSize] = useState<{ rows: number, cols: number } | null>(null)
  const displaySize = hoveredSize ?? { rows, cols }

  const handleApply = () => {
    const nextRows = clamp(rows, 1, 50)
    const nextCols = clamp(cols, 1, 20)
    editor.chain().focus().run()
    const context = getTableContext(editor.state)
    if (!context) {
      return
    }

    if (context.hasHeaderRow !== withHeaderRow) {
      selectCell(editor, context, 0, 0)
      editor.commands.toggleHeaderRow()
    }

    resizeTable(editor, nextRows, nextCols)
    setOpen(false)
  }

  const handleGridSelect = (nextRows: number, nextCols: number) => {
    setRows(nextRows)
    setCols(nextCols)
  }

  const handleGridHover = (nextRows: number, nextCols: number) => {
    setHoveredSize({ rows: nextRows, cols: nextCols })
  }

  const handleGridLeave = () => {
    setHoveredSize(null)
  }

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen)
    if (!nextOpen) {
      return
    }
    const context = getTableContext(editor.state)
    if (!context) {
      return
    }
    setRows(context.rows)
    setCols(context.cols)
    setWithHeaderRow(context.hasHeaderRow)
    setHoveredSize(null)
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button
              aria-label={t('editor.table.settings')}
              className="h-8 w-8 px-0"
              onMouseDown={event => event.preventDefault()}
              size="icon-sm"
              type="button"
              variant="ghost"
            >
              <MdSettings size={16} />
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent side="top" sideOffset={6}>
          {t('editor.table.settings')}
        </TooltipContent>
      </Tooltip>
      <PopoverContent side="top" align="start" className="w-64 p-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-muted-foreground">{t('editor.table.header_row')}</span>
          <Switch checked={withHeaderRow} onCheckedChange={setWithHeaderRow} />
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            {t('editor.table.rows')}
            <Input
              type="number"
              min={1}
              value={rows}
              onChange={event => setRows(Number(event.target.value) || 1)}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            {t('editor.table.columns')}
            <Input
              type="number"
              min={1}
              value={cols}
              onChange={event => setCols(Number(event.target.value) || 1)}
            />
          </label>
        </div>
        <TableSizeGrid
          hovered={displaySize}
          onHover={handleGridHover}
          onLeave={handleGridLeave}
          onSelect={handleGridSelect}
          selectSizeLabel={t('editor.table.select_size')}
          getCellLabel={(row, col) =>
            t('editor.table.select_size_cell', { rows: row, cols: col })}
        />
        <div className="mt-3 flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            {displaySize.rows}
            {' '}
            ×
            {displaySize.cols}
          </span>
          <Button size="sm" type="button" onClick={handleApply}>
            {t('editor.table.apply')}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}

interface TableSizeGridProps {
  hovered: { rows: number, cols: number }
  onHover: (rows: number, cols: number) => void
  onLeave: () => void
  onSelect: (rows: number, cols: number) => void
  selectSizeLabel: string
  getCellLabel: (row: number, col: number) => string
}

function TableSizeGrid({
  hovered,
  onHover,
  onLeave,
  onSelect,
  selectSizeLabel,
  getCellLabel,
}: TableSizeGridProps) {
  return (
    <div className="mt-3">
      <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
        <MdGridOn size={14} />
        {selectSizeLabel}
      </div>
      <div
        className="grid grid-cols-10 gap-1"
        onMouseLeave={onLeave}
      >
        {Array.from({ length: GRID_MAX * GRID_MAX }).map((_, index) => {
          const row = Math.floor(index / GRID_MAX) + 1
          const col = (index % GRID_MAX) + 1
          const isActive = row <= hovered.rows && col <= hovered.cols
          return (
            <button
              key={`${row}-${col}`}
              type="button"
              aria-label={getCellLabel(row, col)}
              className={cn(
                'h-4 w-4 rounded border border-border',
                isActive ? 'bg-primary/80' : 'bg-muted',
              )}
              onMouseDown={event => event.preventDefault()}
              onMouseEnter={() => onHover(row, col)}
              onClick={() => onSelect(row, col)}
            />
          )
        })}
      </div>
    </div>
  )
}
