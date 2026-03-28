import type { Editor } from '@tiptap/core'
import type { TableContext } from './table-menu-utils'
import { Button } from '@memorilo/components/ui/button'
import { Input } from '@memorilo/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@memorilo/components/ui/popover'
import { Switch } from '@memorilo/components/ui/switch'
import { Tooltip, TooltipContent, TooltipTrigger } from '@memorilo/components/ui/tooltip'
import { cn } from '@memorilo/utils'
import { Console, Effect } from 'effect'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { MdGridOn, MdSettings } from 'react-icons/md'
import { getTableContext, resizeTable, selectCell } from './table-menu-utils'

interface TableSettingsPopoverProps {
  editor: Editor
  tableContext: TableContext
}

const GRID_MAX = 10
const TABLE_ROW_LIMIT = 50
const TABLE_COLUMN_LIMIT = 20

function parseTableDimension(value: string, min: number, max: number) {
  if (!/^\d+$/.test(value)) {
    return null
  }

  const parsedValue = Number.parseInt(value, 10)
  if (!Number.isInteger(parsedValue) || parsedValue < min || parsedValue > max) {
    return null
  }

  return parsedValue
}

export function TableSettingsPopover({ editor, tableContext }: TableSettingsPopoverProps) {
  const { t } = useTranslation('app')
  const [open, setOpen] = useState(false)
  const [rowInput, setRowInput] = useState(String(tableContext.rows))
  const [columnInput, setColumnInput] = useState(String(tableContext.cols))
  const [withHeaderRow, setWithHeaderRow] = useState(tableContext.hasHeaderRow)
  const [hoveredSize, setHoveredSize] = useState<{ rows: number, cols: number } | null>(null)
  const parsedRows = parseTableDimension(rowInput, 1, TABLE_ROW_LIMIT)
  const parsedCols = parseTableDimension(columnInput, 1, TABLE_COLUMN_LIMIT)
  const displaySize = hoveredSize ?? (parsedRows && parsedCols
    ? { rows: parsedRows, cols: parsedCols }
    : null)

  const handleApply = () => {
    if (parsedRows === null || parsedCols === null) {
      return
    }

    editor.chain().focus().run()
    const context = getTableContext(editor.state)
    if (!context) {
      return
    }

    try {
      if (context.hasHeaderRow !== withHeaderRow) {
        selectCell(editor, context, 0, 0)
        editor.commands.toggleHeaderRow()
      }

      resizeTable(editor, parsedRows, parsedCols)
      setOpen(false)
    }
    catch (error) {
      Effect.runFork(Console.error('Failed to apply table settings', error))
    }
  }

  const handleGridSelect = (nextRows: number, nextCols: number) => {
    setRowInput(String(nextRows))
    setColumnInput(String(nextCols))
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
    setRowInput(String(context.rows))
    setColumnInput(String(context.cols))
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
              data-testid="bubble-table-settings"
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
          <Switch
            checked={withHeaderRow}
            onCheckedChange={setWithHeaderRow}
            data-testid="bubble-table-header-switch"
          />
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            {t('editor.table.rows')}
            <Input
              type="number"
              min={1}
              max={TABLE_ROW_LIMIT}
              inputMode="numeric"
              value={rowInput}
              onChange={event => setRowInput(event.target.value)}
              aria-invalid={parsedRows === null}
              data-testid="bubble-table-rows-input"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            {t('editor.table.columns')}
            <Input
              type="number"
              min={1}
              max={TABLE_COLUMN_LIMIT}
              inputMode="numeric"
              value={columnInput}
              onChange={event => setColumnInput(event.target.value)}
              aria-invalid={parsedCols === null}
              data-testid="bubble-table-columns-input"
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
            {displaySize
              ? `${displaySize.rows} × ${displaySize.cols}`
              : t('editor.table.select_size')}
          </span>
          <Button
            size="sm"
            type="button"
            onClick={handleApply}
            disabled={parsedRows === null || parsedCols === null}
            data-testid="bubble-table-apply"
          >
            {t('editor.table.apply')}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}

interface TableSizeGridProps {
  hovered: { rows: number, cols: number } | null
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
          const isActive = hovered !== null
            && row <= hovered.rows
            && col <= hovered.cols
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
