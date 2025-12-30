import type { Path, Element as SlateElement } from 'slate'
import type {
  MemoriloElementStrings,
  TableBodyElementType,
  TableCellElementType,
  TableHeadElementType,
  TableHeaderCellElementType,
  TableRowElementType,
} from '../../../slate'
import { Iterable, Option, Tuple } from 'effect'
import { Editor, Node, Transforms } from 'slate'
import { TableEditor } from 'slate-table'
import {
  isHiddenTableHead,
  isTable,
  isTableBody,
  isTableCell,
  isTableFooter,
  isTableHead,
  isTableRow,
  isTableSection,
} from '../../../lib/element-type'
import { TABLE_BLOCKS } from '../../elements/table/type'

type HiddenTableHead = TableHeadElementType & { hidden?: boolean }

export interface TableState {
  /** Path to the current table node. */
  tablePath: Path
  /** Count of body rows (at least 1). */
  rowCount: number
  /** Max column count across sections. */
  columnCount: number
  /** Whether a visible header exists. */
  hasHeader: boolean
  /** Memoization key derived from table path and dimensions. */
  signature: string
}

export interface TableSettings {
  /** Desired body row count (min 1). */
  rowCount: number
  /** Desired column count (min 1). */
  columnCount: number
  /** Whether the header section should be shown. */
  hasHeader: boolean
}

/** Returns the structural state of the table under the current selection, or null if outside. */
export function getTableState(editor: Editor): TableState | null {
  if (!editor.selection)
    return null

  const tableEntry = Editor.above(editor, {
    at: editor.selection,
    match: node => isTable(node),
  })

  if (!tableEntry)
    return null

  const [, tablePath] = tableEntry
  const bodySection = findSection(editor, tablePath, TABLE_BLOCKS.tbody)
  const headerSection = findSection(editor, tablePath, TABLE_BLOCKS.thead)

  const bodyRows = bodySection ? getRowEntries(editor, bodySection[1]) : []
  const headerRows = headerSection ? getRowEntries(editor, headerSection[1]) : []

  const hasHeader = Boolean(headerSection && !isHiddenTableHead(headerSection[0]) && headerRows.length > 0)
  const rowCount = Math.max(1, bodyRows.length)
  const columnCount = getTableColumnCount(editor, tablePath)

  return {
    tablePath,
    rowCount,
    columnCount,
    hasHeader,
    signature: [
      tablePath.toString(),
      rowCount,
      columnCount,
      hasHeader ? '1' : '0',
    ].join('|'),
  }
}

/**
 * Applies the requested table settings (rows/columns/header visibility) to the given table.
 * Operations run within a single normalization pass to avoid transient invalid states.
 */
export function applyTableSettings(editor: Editor, state: TableState, settings: TableSettings) {
  if (!Node.has(editor, state.tablePath))
    return

  const nextColumns = Math.max(1, settings.columnCount)
  const nextRows = Math.max(1, settings.rowCount)

  Editor.withoutNormalizing(editor, () => {
    syncHeaderVisibility(editor, state.tablePath, nextColumns, settings.hasHeader)
    adjustColumnCount(editor, state.tablePath, nextColumns)
    adjustBodyRowCount(editor, state.tablePath, nextRows, nextColumns)
  })
}

function syncHeaderVisibility(editor: Editor, tablePath: Path, columnCount: number, shouldShowHeader: boolean) {
  const headerEntry = findSection(editor, tablePath, TABLE_BLOCKS.thead)

  if (!shouldShowHeader) {
    if (headerEntry)
      Transforms.setNodes<HiddenTableHead>(editor, { hidden: true }, { at: headerEntry[1] })
    return
  }

  if (!headerEntry) {
    const headerRow = createRow(TABLE_BLOCKS.th, columnCount)
    const headerNode: HiddenTableHead = {
      type: TABLE_BLOCKS.thead,
      hidden: false,
      children: [headerRow],
    }
    Transforms.insertNodes(editor, headerNode, { at: [...tablePath, 0] })
    return
  }

  const [headerElement, headerPath] = headerEntry
  if (isHiddenTableHead(headerElement))
    Transforms.unsetNodes(editor, 'hidden', { at: headerPath })

  const rows = getRowEntries(editor, headerPath)
  if (rows.length === 0) {
    Transforms.insertNodes(editor, createRow(TABLE_BLOCKS.th, columnCount), { at: [...headerPath, 0] })
  }
  ensureSectionCells(editor, headerPath, TABLE_BLOCKS.th)
}

function adjustColumnCount(editor: Editor, tablePath: Path, targetColumns: number) {
  let currentColumns = getTableColumnCount(editor, tablePath)

  while (currentColumns < targetColumns) {
    const anchor = findLastCellPath(editor, tablePath)
    if (!anchor)
      break
    TableEditor.insertColumn(editor, { at: anchor })
    currentColumns = getTableColumnCount(editor, tablePath)
  }

  while (currentColumns > targetColumns) {
    const anchor = findLastCellPath(editor, tablePath)
    if (!anchor)
      break
    TableEditor.removeColumn(editor, { at: anchor })
    currentColumns = getTableColumnCount(editor, tablePath)
  }
}

function adjustBodyRowCount(editor: Editor, tablePath: Path, targetRows: number, columnCount: number) {
  const bodyPath = ensureBody(editor, tablePath, columnCount)
  if (!bodyPath)
    return

  let rows = getRowEntries(editor, bodyPath)
  let currentRows = rows.length

  while (currentRows < targetRows) {
    const anchorRow = rows[rows.length - 1]
    if (!anchorRow)
      break
    TableEditor.insertRow(editor, { at: anchorRow[1] })
    rows = getRowEntries(editor, bodyPath)
    currentRows = rows.length
  }

  while (currentRows > targetRows && rows.length > 0) {
    const anchorRow = rows[rows.length - 1]
    TableEditor.removeRow(editor, { at: anchorRow[1] })
    rows = getRowEntries(editor, bodyPath)
    currentRows = rows.length
  }
}

function ensureBody(editor: Editor, tablePath: Path, columnCount: number): Path | null {
  const bodyEntry = findSection(editor, tablePath, TABLE_BLOCKS.tbody)
  if (bodyEntry) {
    const rows = getRowEntries(editor, bodyEntry[1])
    if (rows.length === 0) {
      const row = createRow(TABLE_BLOCKS.td, columnCount)
      Transforms.insertNodes(editor, row, { at: [...bodyEntry[1], 0] })
    }
    return bodyEntry[1]
  }

  const body: TableBodyElementType = {
    type: TABLE_BLOCKS.tbody,
    children: [createRow(TABLE_BLOCKS.td, columnCount)],
  }

  const insertPath = getBodyInsertPath(editor, tablePath)
  Transforms.insertNodes(editor, body, { at: insertPath })
  return insertPath
}

function ensureSectionCells(editor: Editor, sectionPath: Path, targetCellType: MemoriloElementStrings) {
  const rows = getRowEntries(editor, sectionPath)
  for (const [, rowPath] of rows) {
    for (const [cell, cellPath] of Node.children(editor, rowPath)) {
      if (isTableCell(cell) && cell.type !== targetCellType)
        Transforms.setNodes(editor, { type: targetCellType }, { at: cellPath })
    }
  }
}

function getBodyInsertPath(editor: Editor, tablePath: Path): Path {
  const table = (Node.get(editor, tablePath)) as SlateElement
  const children = Array.isArray(table.children) ? table.children : []
  const footIndex = children.findIndex(child => isTableFooter(child))
  const insertIndex = footIndex >= 0 ? footIndex : children.length
  return [...tablePath, insertIndex]
}

function getTableColumnCount(editor: Editor, tablePath: Path): number {
  let maxColumns = 0

  for (const [, sectionPath] of getSectionEntries(editor, tablePath)) {
    for (const [row] of getRowEntries(editor, sectionPath)) {
      const columnCount = row.children.reduce(
        (sum, cell) => sum + (isTableCell(cell) ? cell.colSpan ?? 1 : 0),
        0,
      )
      maxColumns = Math.max(maxColumns, columnCount)
    }
  }

  return Math.max(1, maxColumns)
}

function getSectionEntries(editor: Editor, tablePath: Path) {
  const sections: Array<[SlateElement, Path]> = []
  for (const [child, childPath] of Node.children(editor, tablePath)) {
    if (isTableSection(child))
      sections.push([child, childPath])
  }
  return sections
}

function findSection(editor: Editor, tablePath: Path, type: string) {
  for (const [child, childPath] of Node.children(editor, tablePath)) {
    if (type === TABLE_BLOCKS.thead && isTableHead(child))
      return [child as SlateElement, childPath] as const
    if (type === TABLE_BLOCKS.tbody && isTableBody(child))
      return [child as SlateElement, childPath] as const
    if (type === TABLE_BLOCKS.tfoot && isTableFooter(child))
      return [child as SlateElement, childPath] as const
  }
  return undefined
}

function getRowEntries(editor: Editor, sectionPath: Path) {
  const rows: Array<[SlateElement, Path]> = []
  for (const [child, childPath] of Node.children(editor, sectionPath)) {
    if (isTableRow(child))
      rows.push([child, childPath])
  }
  return rows
}

function findLastCellPath(editor: Editor, tablePath: Path): Path | null {
  return Iterable.head(Editor.nodes(editor, {
    at: tablePath,
    match: node => isTableCell(node),
    reverse: true,
  })).pipe(
    Option.map(Tuple.getSecond),
    Option.getOrNull,
  )
}

function createRow(cellType: MemoriloElementStrings, columnCount: number): TableRowElementType {
  const safeColumnCount = Math.max(1, columnCount)
  return {
    type: TABLE_BLOCKS.tr,
    children: Array.from({ length: safeColumnCount }).map(() => createCell(cellType)),
  } satisfies TableRowElementType
}

function createCell(cellType: MemoriloElementStrings): TableCellElementType | TableHeaderCellElementType {
  const type = cellType === TABLE_BLOCKS.th ? TABLE_BLOCKS.th : TABLE_BLOCKS.td
  return {
    type,
    children: [{
      type: TABLE_BLOCKS.content,
      children: [{ text: '' }],
    }],
  }
}
