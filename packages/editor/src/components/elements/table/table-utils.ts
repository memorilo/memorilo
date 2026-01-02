import type { MemoriloEditor, TableBodyElementType, TableCellElementType, TableElementType, TableHeadElementType, TableHeaderCellElementType } from '../../../slate'
import { Iterable, Option, pipe } from 'effect'
import { Editor, Node, Path, Element as SlateElement, Transforms } from 'slate'
import { ReactEditor } from 'slate-react'
import { TableCursor, TableEditor } from 'slate-table'
import {
  isHiddenTableHead,
  isTable,
  isTableCell,
  isTableRow,
  isTableSection,
} from '../../../lib/element-type'
import { getCellColumnIndex } from '../../../lib/table-reorder'
import { createTableRow } from './table-structure'
import { TABLE_BLOCKS } from './type'

export type TableSelectableCell = TableCellElementType | TableHeaderCellElementType
export type TableInsertPosition = 'before' | 'after'
export type TableInsertAxis = 'row' | 'column'

const DEFAULT_TABLE_SIZE = { rows: 3, cols: 3 } as const

export function isFirstColumn(editor: MemoriloEditor, element: TableSelectableCell): boolean {
  const cellPath = ReactEditor.findPath(editor, element)
  const columnIndex = getCellColumnIndex(editor, cellPath)
  if (columnIndex === null)
    return cellPath[cellPath.length - 1] === 0
  return columnIndex === 0
}

export function getFirstVisibleRowPath(editor: MemoriloEditor, tablePath: Path): Path | null {
  for (const [section, sectionPath] of Node.children(editor, tablePath)) {
    if (!isTableSection(section))
      continue
    if (isHiddenTableHead(section))
      continue
    for (const [row, rowPath] of Node.children(editor, sectionPath)) {
      if (isTableRow(row))
        return rowPath
    }
  }
  return null
}

export function isTopRow(editor: MemoriloEditor, element: TableSelectableCell): boolean {
  const cellPath = ReactEditor.findPath(editor, element)
  const rowEntry = Editor.above(editor, {
    at: cellPath,
    match: node => isTableRow(node),
  })
  if (!rowEntry)
    return false

  const [, rowPath] = rowEntry
  const tableEntry = Editor.above(editor, {
    at: rowPath,
    match: node => isTable(node),
  })
  if (!tableEntry)
    return false

  const [, tablePath] = tableEntry
  const firstRowPath = getFirstVisibleRowPath(editor, tablePath)

  return Boolean(firstRowPath && Path.equals(rowPath, firstRowPath))
}

export function canEditTable(editor: MemoriloEditor): boolean {
  return Boolean(editor.selection && TableCursor.isInTable(editor))
}

/**
 * Returns whether the current selection touches a merged cell (rowSpan/colSpan > 1).
 */
export function canSplitTableSelection(editor: MemoriloEditor): boolean {
  if (!editor.selection || !TableCursor.isInTable(editor))
    return false

  return Boolean(pipe(
    Editor.nodes(editor, {
      at: editor.selection,
      match: node => isTableCell(node) && ((node.rowSpan ?? 1) > 1 || (node.colSpan ?? 1) > 1),
    }),
    Iterable.head,
    Option.getOrNull,
  ))
}

export function insertDefaultTable(editor: MemoriloEditor) {
  if (!editor.selection || TableCursor.isInTable(editor))
    return

  const tableNode = createTableNode(DEFAULT_TABLE_SIZE.rows, DEFAULT_TABLE_SIZE.cols)

  Editor.withoutNormalizing(editor, () => {
    const insertPath = resolveInsertPath(editor)
    Transforms.insertNodes(editor, tableNode, { at: insertPath })
    selectFirstTableCell(editor, insertPath)
  })
}

export function insertTableRow(editor: MemoriloEditor, position: TableInsertPosition) {
  insertTableAxis(editor, 'row', position)
}

export function insertTableColumn(editor: MemoriloEditor, position: TableInsertPosition) {
  insertTableAxis(editor, 'column', position)
}

const TABLE_AXIS_ACTIONS: Record<TableInsertAxis, {
  insert: (editor: MemoriloEditor, before: boolean) => void
  move: Record<TableInsertPosition, (editor: MemoriloEditor) => boolean>
}> = {
  row: {
    insert: (editor, before) => TableEditor.insertRow(editor, { before }),
    move: {
      before: editor => TableCursor.upward(editor),
      after: editor => TableCursor.downward(editor),
    },
  },
  column: {
    insert: (editor, before) => TableEditor.insertColumn(editor, { before }),
    move: {
      before: editor => TableCursor.backward(editor),
      after: editor => TableCursor.forward(editor),
    },
  },
}

function insertTableAxis(editor: MemoriloEditor, axis: TableInsertAxis, position: TableInsertPosition) {
  if (!canEditTable(editor))
    return

  const action = TABLE_AXIS_ACTIONS[axis]
  action.insert(editor, position === 'before')
  action.move[position](editor)
}

function createTableNode(rows: number, cols: number): TableElementType {
  const safeRows = Math.max(1, rows)
  const safeCols = Math.max(1, cols)

  const head: TableHeadElementType = {
    type: TABLE_BLOCKS.thead,
    children: [createTableRow(TABLE_BLOCKS.th, safeCols)],
  }

  const body: TableBodyElementType = {
    type: TABLE_BLOCKS.tbody,
    children: Array.from({ length: safeRows }).map(() => createTableRow(TABLE_BLOCKS.td, safeCols)),
  }

  return {
    type: TABLE_BLOCKS.table,
    children: [head, body],
  }
}

function resolveInsertPath(editor: MemoriloEditor): Path {
  const blockEntry = Editor.above(editor, {
    at: editor.selection ?? undefined,
    match: node => SlateElement.isElement(node) && Editor.isBlock(editor, node),
    mode: 'lowest',
  })

  if (!blockEntry)
    return [editor.children.length]

  const [block, blockPath] = blockEntry
  const isEmptyBlock = Node.string(block).trim() === ''

  if (isEmptyBlock) {
    Transforms.removeNodes(editor, { at: blockPath })
    return blockPath
  }

  Transforms.splitNodes(editor, {
    at: editor.selection ?? undefined,
    match: node => SlateElement.isElement(node) && Editor.isBlock(editor, node),
  })
  return Path.next(blockPath)
}

function selectFirstTableCell(editor: MemoriloEditor, tablePath: Path) {
  const rowPath = getFirstVisibleRowPath(editor, tablePath)
  if (!rowPath)
    return

  const cellPath = rowPath.concat(0)
  if (!Node.has(editor, cellPath))
    return

  Transforms.select(editor, Editor.start(editor, cellPath))
}
