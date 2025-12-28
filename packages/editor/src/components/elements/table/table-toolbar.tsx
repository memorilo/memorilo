import type { MouseEvent } from 'react'
import type { Element } from 'slate'
import type { RenderElementProps } from 'slate-react'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { LuTrash2 } from 'react-icons/lu'
import { Editor, Node, Path, Transforms } from 'slate'
import { ReactEditor, useSlateSelection, useSlateStatic } from 'slate-react'
import { TableEditor } from 'slate-table'
import { isTableBody, isTableCell, isTableHead, isTableHeaderCell, isTableRow } from '../../../lib/element-type'
import { resizeTablePreserveContent } from '../../../lib/table-operations'
import { TableToolbarButton } from './table-toolbar-button'
import { TableToolbarMenu } from './table-toolbar-menu'
import { TableToolbarResizePopover } from './table-toolbar-resize'

interface TableToolbarProps {
  element: RenderElementProps['element']
  isActive: boolean
  setLoading: (loading: boolean) => void
}

export function TableToolbar({ element, isActive, setLoading }: TableToolbarProps) {
  const { t } = useTranslation('app')
  const editor = useSlateStatic()
  const selection = useSlateSelection()
  const tablePath = useMemo(
    () => ReactEditor.findPath(editor, element),
    [editor, element],
  )

  const selectionInTable = useMemo(() => {
    if (!selection || !isActive)
      return false
    return Path.isAncestor(tablePath, selection.anchor.path) && Path.isAncestor(tablePath, selection.focus.path)
  }, [selection, isActive, tablePath])

  const cellPathFromSelection = useMemo(() => {
    if (!selectionInTable)
      return null
    try {
      const entry = Editor.above(editor, {
        at: selection!,
        match: n => isTableCell(n),
      })
      return entry ? entry[1] : null
    }
    catch {
      return null
    }
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
  const defaultCellPath = useMemo(() => [...tablePath, 0, 0, 0] as Path, [tablePath])
  const firstTextPath = useMemo(() => [...tablePath, 0, 0, 0, 0, 0] as Path, [tablePath])

  const activeCellPath = useMemo(() => {
    if ((designOpen || menuOpen) && !cellPathFromSelection) {
      return defaultCellPath
    }
    if (!selectionInTable && !designOpen && !menuOpen) {
      return null
    }
    return cellPathFromSelection
  }, [designOpen, menuOpen, cellPathFromSelection, defaultCellPath, selectionInTable])

  const activeCellEntry = useMemo(() => {
    if (!inCurrentTable || !activeCellPath)
      return null
    try {
      const node = Node.get(editor, activeCellPath)
      if (isTableCell(node))
        return [node, activeCellPath] as const
    }
    catch {
      return null
    }
    return null
  }, [activeCellPath, editor, inCurrentTable])

  const toolbarVisible = (inCurrentTable || designOpen || menuOpen) && isActive

  if (!toolbarVisible)
    return null

  const focusEditor = () => ReactEditor.focus(editor)

  const resizeTable = (rows: number, cols: number) => {
    const targetPath = tablePath
    setLoading(true)
    requestAnimationFrame(() => {
      try {
        resizeTablePreserveContent(editor, targetPath, rows, cols)
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
      match: n => isTableRow(n),
    })) {
      const targetPath = [...rowPath, columnIndex]
      if (Editor.hasPath(editor, targetPath)) {
        const node = Node.get(editor, targetPath)
        if (isTableCell(node)) {
          Transforms.setNodes(editor, { align }, { at: targetPath })
        }
      }
    }
    focusEditor()
    setMenuOpen(false)
  }

  const handleAlign = (align: 'left' | 'center' | 'right') => (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault()
    applyColumnAlign(align)
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
      const isHeader = isTableHead(sectionNode)

      if (isHeader) {
        const bodyPath = Path.next(sectionPath)
        const ensureBodyExists = () => {
          const hasBody = Editor.hasPath(editor, bodyPath)
            && isTableBody(Node.get(editor, bodyPath))
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
              match: n => isTableHeaderCell(n),
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

  return (
    <div
      contentEditable={false}
      className="table-toolbar-surface"
    >
      <TableToolbarResizePopover
        open={designOpen}
        onOpenChange={setDesignOpen}
        currentSize={currentSize}
        onResize={resizeTable}
      />

      <TableToolbarButton
        variant="icon"
        title={t('table.toolbar.deleteTitle')}
        onMouseDown={handleDeleteTable}
      >
        <LuTrash2 />
      </TableToolbarButton>

      <TableToolbarMenu
        open={menuOpen}
        onOpenChange={setMenuOpen}
        onAlignLeft={handleAlign('left')}
        onAlignCenter={handleAlign('center')}
        onAlignRight={handleAlign('right')}
        onInsertRowAbove={handleRow({ before: true })}
        onInsertRowBelow={handleRow({ before: false })}
        onDeleteRow={handleRow({ remove: true })}
        onInsertColLeft={handleColumn({ before: true })}
        onInsertColRight={handleColumn({ before: false })}
        onDeleteCol={handleColumn({ remove: true })}
      />
    </div>
  )
}
