import { Popover, PopoverContent, PopoverTrigger } from '@memorilo/components/ui/popover'
import { cn } from '@memorilo/utils'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { LuTable2 } from 'react-icons/lu'
import { UtilButton } from '../../util-button'
import { TableToolbarButton } from './table-toolbar-button'

interface TableToolbarSize {
  rows: number
  cols: number
}

interface TableToolbarResizePopoverProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  currentSize: TableToolbarSize
  onResize: (rows: number, cols: number) => void
}

const GRID_ROWS_VISIBLE = 10
const GRID_COLS_VISIBLE = 6
const MAX_ROWS = 20
const MAX_COLS = 10

export function TableToolbarResizePopover({
  open,
  onOpenChange,
  currentSize,
  onResize,
}: TableToolbarResizePopoverProps) {
  const { t } = useTranslation('app')
  const [gridHover, setGridHover] = useState({
    rows: Math.min(currentSize.rows || 1, GRID_ROWS_VISIBLE),
    cols: Math.min(currentSize.cols || 1, GRID_COLS_VISIBLE),
  })
  const [rowInput, setRowInput] = useState(Math.min(currentSize.rows || 1, MAX_ROWS))
  const [colInput, setColInput] = useState(Math.min(currentSize.cols || 1, MAX_COLS))

  const clampRows = (value: number) => Math.max(1, Math.min(MAX_ROWS, value))
  const clampCols = (value: number) => Math.max(1, Math.min(MAX_COLS, value))

  const commitResize = (rows: number, cols: number) => {
    const nextRows = clampRows(rows)
    const nextCols = clampCols(cols)
    setRowInput(nextRows)
    setColInput(nextCols)
    setGridHover({ rows: nextRows, cols: nextCols })
    onResize(nextRows, nextCols)
  }

  const gridCells = Array.from({ length: GRID_ROWS_VISIBLE * GRID_COLS_VISIBLE }, (_, idx) => {
    const row = Math.floor(idx / GRID_COLS_VISIBLE) + 1
    const col = (idx % GRID_COLS_VISIBLE) + 1
    const isActiveCell = row <= gridHover.rows && col <= gridHover.cols
    return (
      <button
        key={`${row}-${col}`}
        type="button"
        className={cn(
          'table-grid-button',
          isActiveCell && 'is-active',
        )}
        onMouseEnter={() => {
          setGridHover({ rows: row, cols: col })
          setRowInput(row)
          setColInput(col)
        }}
        onClick={(e) => {
          e.preventDefault()
          commitResize(row, col)
        }}
      />
    )
  })

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <TableToolbarButton
          variant="icon"
          title={t('table.toolbar.resizeTitle')}
          onMouseDown={e => e.preventDefault()}
        >
          <LuTable2 />
        </TableToolbarButton>
      </PopoverTrigger>
      <PopoverContent className="table-design-popover" side="bottom" align="start">
        <div className="table-grid">
          {gridCells}
        </div>
        <div className="table-design-controls">
          <div className="table-size-inputs">
            <input
              type="number"
              min={1}
              max={MAX_ROWS}
              value={rowInput}
              onChange={(e) => {
                const val = clampRows(Number(e.target.value) || 1)
                setRowInput(val)
                setGridHover(prev => ({ ...prev, rows: val }))
              }}
              className="table-size-input"
            />
            <span className="table-size-separator">x</span>
            <input
              type="number"
              min={1}
              max={MAX_COLS}
              value={colInput}
              onChange={(e) => {
                const val = clampCols(Number(e.target.value) || 1)
                setColInput(val)
                setGridHover(prev => ({ ...prev, cols: val }))
              }}
              className="table-size-input"
            />
          </div>
          <UtilButton
            className="table-apply-button"
            tabIndex={-1}
            onMouseDown={e => e.preventDefault()}
            onClick={(e) => {
              e.preventDefault()
              commitResize(rowInput, colInput)
            }}
          >
            {t('table.toolbar.apply')}
          </UtilButton>
        </div>
      </PopoverContent>
    </Popover>
  )
}
