import type { MouseEvent } from 'react'
import type { RenderElementProps } from 'slate-react'
import { Popover, PopoverContent, PopoverTrigger } from '@memorilo/components/ui/popover'
import { cn } from '@memorilo/utils'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { LuEllipsisVertical, LuTable2, LuTrash2 } from 'react-icons/lu'
import { Editor, Element, Node, Path, Transforms } from 'slate'
import { ReactEditor, useSlateSelection, useSlateStatic } from 'slate-react'
import { TableEditor } from 'slate-table'
import { rebuildTablePreserveContent } from '../../../lib/with-table'
import { UtilButton } from '../../util-button'

interface TableToolbarProps {
  element: RenderElementProps['element']
  isActive: boolean
  setLoading: (loading: boolean) => void
}

const GRID_ROWS_VISIBLE = 10
const GRID_COLS_VISIBLE = 6
const MAX_ROWS = 20
const MAX_COLS = 10

export function TableToolbar({ element, isActive, setLoading }: TableToolbarProps) {
  const { t } = useTranslation('app')
  const editor = useSlateStatic()
  const selection = useSlateSelection()
  const tablePath = useMemo(
    () => ReactEditor.findPath(editor, element),
    [editor, element],
  )
  const [activeCellPath, setActiveCellPath] = useState<Path | null>(null)

  const selectionInTable = useMemo(() => {
    if (!selection || !isActive)
      return false
    return Path.isAncestor(tablePath, selection.anchor.path) && Path.isAncestor(tablePath, selection.focus.path)
  }, [selection, isActive, tablePath])

  useEffect(() => {
    if (!selectionInTable)
      return
    const entry = Editor.above(editor, {
      at: selection!,
      match: n => Element.isElement(n) && (n.type === 'table-cell' || n.type === 'table-header'),
    })
    if (entry)
      setActiveCellPath(entry[1])
  }, [editor, selection, selectionInTable])

  const inCurrentTable = isActive && selectionInTable

  const currentSize = useMemo(() => {
    const sections = Array.isArray((element as any).children) ? (element as any).children : []
    const allRows = sections.reduce((acc: any[], section: any) => acc.concat(section?.children ?? []), [] as any[])
    const rows = allRows.length
    const cols = rows > 0 && Array.isArray(allRows[0]?.children) ? allRows[0].children.length : 0
    return { rows, cols }
  }, [element])

  const [designOpen, setDesignOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [gridHover, setGridHover] = useState({
    rows: Math.min(currentSize.rows || 1, GRID_ROWS_VISIBLE),
    cols: Math.min(currentSize.cols || 1, GRID_COLS_VISIBLE),
  })
  const [rowInput, setRowInput] = useState(Math.min(currentSize.rows || 1, MAX_ROWS))
  const [colInput, setColInput] = useState(Math.min(currentSize.cols || 1, MAX_COLS))
  const defaultCellPath = useMemo(() => [...tablePath, 0, 0, 0] as Path, [tablePath])
  const firstTextPath = useMemo(() => [...tablePath, 0, 0, 0, 0, 0] as Path, [tablePath])

  const activeCellEntry = useMemo(() => {
    if (!inCurrentTable || !activeCellPath)
      return null
    try {
      const node = Node.get(editor, activeCellPath)
      if (Element.isElement(node) && (node.type === 'table-cell' || node.type === 'table-header'))
        return [node, activeCellPath] as const
    }
    catch {
      return null
    }
    return null
  }, [activeCellPath, editor, inCurrentTable])

  useEffect(() => {
    if ((designOpen || menuOpen) && !activeCellPath) {
      setActiveCellPath(defaultCellPath)
    }
    if (!selectionInTable && !designOpen && !menuOpen) {
      setActiveCellPath(null)
    }
  }, [designOpen, menuOpen, activeCellPath, defaultCellPath, selectionInTable])

  const toolbarVisible = (inCurrentTable || designOpen || menuOpen) && isActive

  if (!toolbarVisible)
    return null

  const focusEditor = () => ReactEditor.focus(editor)

  const clampRows = (value: number) => Math.max(1, Math.min(MAX_ROWS, value))
  const clampCols = (value: number) => Math.max(1, Math.min(MAX_COLS, value))

  const resizeTable = (rows: number, cols: number) => {
    const targetPath = tablePath
    const nextRows = clampRows(rows)
    const nextCols = clampCols(cols)
    setRowInput(nextRows)
    setColInput(nextCols)
    setGridHover({ rows: nextRows, cols: nextCols })
    setLoading(true)
    requestAnimationFrame(() => {
      try {
        rebuildTablePreserveContent(editor, targetPath, nextRows, nextCols)
        Transforms.select(editor, { path: firstTextPath, offset: 0 })
      }
      catch (error) {
        void error // Selection may fail if structure differs; ignore.
      }
      finally {
        setLoading(false)
      }
      focusEditor()
      setDesignOpen(false)
    })
  }

  const applyColumnAlign = (align: 'left' | 'center' | 'right') => {
    const cellPath = activeCellEntry?.[1] ?? defaultCellPath
    const columnIndex = cellPath[cellPath.length - 1]
    for (const [, rowPath] of Editor.nodes(editor, {
      at: tablePath,
      match: n => Element.isElement(n) && n.type === 'table-row',
    })) {
      const targetPath = [...rowPath, columnIndex]
      if (Editor.hasPath(editor, targetPath)) {
        const node = Node.get(editor, targetPath)
        if (Element.isElement(node) && (node.type === 'table-cell' || node.type === 'table-header')) {
          Transforms.setNodes(editor, { align }, { at: targetPath })
        }
      }
    }
    focusEditor()
    setMenuOpen(false)
  }

  const handleRow = (options: { before?: boolean, remove?: boolean }) => (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault()
    const cellPath = activeCellEntry?.[1] ?? defaultCellPath
    const rowPath = Path.parent(cellPath)
    const sectionPath = Path.parent(rowPath)
    const sectionNode = Node.get(editor, sectionPath)

    if (options.remove) {
      TableEditor.removeRow(editor, { at: cellPath })
    }
    else {
      const isHeader = Element.isElement(sectionNode) && sectionNode.type === 'table-head'

      if (isHeader) {
        const bodyPath = Path.next(sectionPath)
        const ensureBodyExists = () => {
          const hasBody = Editor.hasPath(editor, bodyPath)
            && (Node.get(editor, bodyPath) as any).type === 'table-body'
          if (!hasBody) {
            Transforms.insertNodes(editor, { type: 'table-body', children: [] } as any, { at: bodyPath })
          }
        }

        if (options.before) {
          const newHeaderRow = {
            type: 'table-row',
            children: Array.from({ length: currentSize.cols }).map(() => ({
              type: 'table-header',
              children: [{ text: '' }],
            })),
          }
          Transforms.insertNodes(editor, newHeaderRow as any, { at: [...sectionPath, 0] })

          ensureBodyExists()
          const oldRowPath = [...sectionPath, 1]
          Transforms.moveNodes(editor, { at: oldRowPath, to: [...bodyPath, 0] })
          Transforms.setNodes(
            editor,
            { type: 'table-cell' } as Partial<Element>,
            {
              at: [...bodyPath, 0],
              match: n => Element.isElement(n) && n.type === 'table-header',
              mode: 'all',
            },
          )
        }
        else {
          ensureBodyExists()
          const newBodyRow = {
            type: 'table-row',
            children: Array.from({ length: currentSize.cols }).map(() => ({
              type: 'table-cell',
              children: [{ text: '' }],
            })),
          }
          Transforms.insertNodes(editor, newBodyRow as any, { at: [...bodyPath, 0] })
          try {
            Transforms.select(editor, { path: [...bodyPath, 0, 0, 0, 0, 0], offset: 0 })
          }
          catch {
            return
          }
        }
      }
      else {
        TableEditor.insertRow(editor, { at: cellPath, before: options.before })
      }
    }
    focusEditor()
  }

  const handleColumn = (options: { before?: boolean, remove?: boolean }) => (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault()
    const cellPath = activeCellEntry?.[1] ?? [...tablePath, 0, 0, 0]
    if (options.remove)
      TableEditor.removeColumn(editor, { at: cellPath })
    else
      TableEditor.insertColumn(editor, { at: cellPath, before: options.before })
    focusEditor()
  }

  const handleDeleteTable = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault()
    TableEditor.removeTable(editor, { at: tablePath })
    focusEditor()
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
          resizeTable(row, col)
        }}
      />
    )
  })

  const iconButtonClass = 'table-toolbar-icon'

  return (
    <div
      contentEditable={false}
      className="table-toolbar-surface"
    >
      <Popover open={designOpen} onOpenChange={setDesignOpen}>
        <PopoverTrigger asChild>
          <UtilButton
            className={iconButtonClass}
            title={t('table.toolbar.resizeTitle')}
            tabIndex={-1}
            onMouseDown={e => e.preventDefault()}
          >
            <LuTable2 />
          </UtilButton>
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
                resizeTable(rowInput, colInput)
              }}
            >
              {t('table.toolbar.apply')}
            </UtilButton>
          </div>
        </PopoverContent>
      </Popover>

      <UtilButton
        className={iconButtonClass}
        title={t('table.toolbar.deleteTitle')}
        tabIndex={-1}
        onMouseDown={handleDeleteTable}
      >
        <LuTrash2 />
      </UtilButton>

      <Popover open={menuOpen} onOpenChange={setMenuOpen}>
        <PopoverTrigger asChild>
          <UtilButton
            className={iconButtonClass}
            title={t('table.toolbar.settingsTitle')}
            tabIndex={-1}
            onMouseDown={e => e.preventDefault()}
          >
            <LuEllipsisVertical />
          </UtilButton>
        </PopoverTrigger>
        <PopoverContent className="table-menu-popover" side="bottom" align="start">
          <UtilButton
            className="table-menu-item"
            tabIndex={-1}
            onMouseDown={(e) => {
              e.preventDefault()
              applyColumnAlign('left')
            }}
          >
            {t('table.menu.alignLeft')}
          </UtilButton>
          <UtilButton
            className="table-menu-item"
            tabIndex={-1}
            onMouseDown={(e) => {
              e.preventDefault()
              applyColumnAlign('center')
            }}
          >
            {t('table.menu.alignCenter')}
          </UtilButton>
          <UtilButton
            className="table-menu-item"
            tabIndex={-1}
            onMouseDown={(e) => {
              e.preventDefault()
              applyColumnAlign('right')
            }}
          >
            {t('table.menu.alignRight')}
          </UtilButton>

          <div className="table-menu-divider" />

          <UtilButton className="table-menu-item" tabIndex={-1} onMouseDown={handleRow({ before: true })}>
            {t('table.menu.insertRowAbove')}
          </UtilButton>
          <UtilButton className="table-menu-item" tabIndex={-1} onMouseDown={handleRow({ before: false })}>
            {t('table.menu.insertRowBelow')}
          </UtilButton>
          <UtilButton className={cn('table-menu-item', 'danger')} tabIndex={-1} onMouseDown={handleRow({ remove: true })}>
            {t('table.menu.deleteRow')}
          </UtilButton>

          <div className="table-menu-divider" />

          <UtilButton className="table-menu-item" tabIndex={-1} onMouseDown={handleColumn({ before: true })}>
            {t('table.menu.insertColLeft')}
          </UtilButton>
          <UtilButton className="table-menu-item" tabIndex={-1} onMouseDown={handleColumn({ before: false })}>
            {t('table.menu.insertColRight')}
          </UtilButton>
          <UtilButton className={cn('table-menu-item', 'danger')} tabIndex={-1} onMouseDown={handleColumn({ remove: true })}>
            {t('table.menu.deleteCol')}
          </UtilButton>
        </PopoverContent>
      </Popover>
    </div>
  )
}
