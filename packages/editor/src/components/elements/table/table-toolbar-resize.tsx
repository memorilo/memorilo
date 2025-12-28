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
  const [rowInput, setRowInput] = useState<number | ''>(currentSize.rows || 1)
  const [colInput, setColInput] = useState<number | ''>(currentSize.cols || 1)

  const clampRows = (value: number | '') => value === '' ? '' : Math.max(1, value)
  const clampCols = (value: number | '') => value === '' ? '' : Math.max(1, value)

  const commitResize = (rows: number | '', cols: number | '') => {
    const nextRows = typeof rows === 'number' ? Math.max(1, rows) : 1
    const nextCols = typeof cols === 'number' ? Math.max(1, cols) : 1
    setRowInput(nextRows)
    setColInput(nextCols)
    setGridHover({ rows: Math.min(nextRows, GRID_ROWS_VISIBLE), cols: Math.min(nextCols, GRID_COLS_VISIBLE) })
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
              value={rowInput}
              onChange={(e) => {
                const inputValue = e.target.value
                if (inputValue === '') {
                  setRowInput('')
                  return
                }
                const val = clampRows(Number(inputValue))
                setRowInput(val)
                if (typeof val === 'number') {
                  setGridHover(prev => ({ ...prev, rows: Math.min(val, GRID_ROWS_VISIBLE) }))
                }
              }}
              className="table-size-input"
            />
            <span className="table-size-separator">x</span>
            <input
              type="number"
              min={1}
              value={colInput}
              onChange={(e) => {
                const inputValue = e.target.value
                if (inputValue === '') {
                  setColInput('')
                  return
                }
                const val = clampCols(Number(inputValue))
                setColInput(val)
                if (typeof val === 'number') {
                  setGridHover(prev => ({ ...prev, cols: Math.min(val, GRID_COLS_VISIBLE) }))
                }
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
