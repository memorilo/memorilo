import type { Path } from 'slate'
import { deepClone } from '@memorilo/utils/utils'
import { Editor, Element, Node, Transforms } from 'slate'
import { TableEditor } from 'slate-table'

export const TABLE_BLOCKS = {
  table: 'table',
  thead: 'table-head',
  tbody: 'table-body',
  tfoot: 'table-footer',
  tr: 'table-row',
  th: 'table-header',
  td: 'table-cell',
  content: 'table-content',
} as const

const TABLE_SECTION_TYPES = [TABLE_BLOCKS.thead, TABLE_BLOCKS.tbody, TABLE_BLOCKS.tfoot] as const
type TableSectionType = typeof TABLE_SECTION_TYPES[number]

function isTableSectionType(type: string): type is TableSectionType {
  return TABLE_SECTION_TYPES.includes(type as TableSectionType)
}

function createContent(text = '') {
  return {
    type: TABLE_BLOCKS.content,
    children: [{ text }],
  }
}

function normalizeCellChildren(children?: any[]) {
  if (Array.isArray(children) && children.length > 0)
    return deepClone(children)
  return [createContent()]
}

function cloneCellAs(cell: any, type: string) {
  return {
    type,
    rowSpan: cell?.rowSpan,
    colSpan: cell?.colSpan,
    align: cell?.align,
    children: normalizeCellChildren(cell?.children),
  }
}

function emptyCell(type: string) {
  return {
    type,
    children: [createContent()],
  }
}

function isTableCell(node: any) {
  return Element.isElement(node) && (node.type === TABLE_BLOCKS.td || node.type === TABLE_BLOCKS.th)
}

function getTableSections(tableNode: any) {
  if (!Element.isElement(tableNode))
    return []
  const sections = Array.isArray(tableNode.children) ? tableNode.children : []
  return sections.flatMap((section, sectionIndex) => {
    if (!Element.isElement(section))
      return []
    if (!isTableSectionType(section.type))
      return []
    const rows = Array.isArray(section.children) ? section.children : []
    const rowEntries = rows.flatMap((row, rowIndex) => {
      if (!Element.isElement(row) || row.type !== TABLE_BLOCKS.tr)
        return []
      return [{ node: row, index: rowIndex }]
    })
    return [{ type: section.type, index: sectionIndex, rows: rowEntries }]
  })
}

function getColumnCount(sections: ReturnType<typeof getTableSections>) {
  const preferredOrder = [TABLE_BLOCKS.thead, TABLE_BLOCKS.tbody, TABLE_BLOCKS.tfoot]
  for (const sectionType of preferredOrder) {
    const section = sections.find(entry => entry.type === sectionType)
    if (!section)
      continue
    for (const row of section.rows) {
      const cells = Array.isArray(row.node.children) ? row.node.children : []
      if (cells.length > 0)
        return cells.length
    }
  }
  for (const section of sections) {
    for (const row of section.rows) {
      const cells = Array.isArray(row.node.children) ? row.node.children : []
      if (cells.length > 0)
        return cells.length
    }
  }
  return 0
}

function getLastCellPath(editor: Editor, tablePath: Path, sectionType?: string) {
  const tableNode = Node.get(editor, tablePath)
  if (!Element.isElement(tableNode))
    return null
  const sections = Array.isArray(tableNode.children) ? tableNode.children : []
  for (let sectionIndex = sections.length - 1; sectionIndex >= 0; sectionIndex--) {
    const section = sections[sectionIndex]
    if (!Element.isElement(section))
      continue
    if (sectionType && section.type !== sectionType)
      continue
    const rows = Array.isArray(section.children) ? section.children : []
    for (let rowIndex = rows.length - 1; rowIndex >= 0; rowIndex--) {
      const row = rows[rowIndex]
      if (!Element.isElement(row) || row.type !== TABLE_BLOCKS.tr)
        continue
      const cells = Array.isArray(row.children) ? row.children : []
      for (let cellIndex = cells.length - 1; cellIndex >= 0; cellIndex--) {
        const cell = cells[cellIndex]
        if (!isTableCell(cell))
          continue
        return [...tablePath, sectionIndex, rowIndex, cellIndex]
      }
    }
  }
  return null
}

function ensureBodySection(editor: Editor, tablePath: Path) {
  const tableNode = Node.get(editor, tablePath)
  if (!Element.isElement(tableNode))
    return [...tablePath, 0]
  const sections = Array.isArray(tableNode.children) ? tableNode.children : []
  const bodyIndex = sections.findIndex(section => Element.isElement(section) && section.type === TABLE_BLOCKS.tbody)
  if (bodyIndex >= 0)
    return [...tablePath, bodyIndex]
  const theadIndex = sections.findIndex(section => Element.isElement(section) && section.type === TABLE_BLOCKS.thead)
  const tfootIndex = sections.findIndex(section => Element.isElement(section) && section.type === TABLE_BLOCKS.tfoot)
  let insertIndex = sections.length
  if (tfootIndex >= 0)
    insertIndex = tfootIndex
  if (theadIndex >= 0)
    insertIndex = theadIndex + 1
  Transforms.insertNodes(editor, { type: TABLE_BLOCKS.tbody, children: [] } as any, { at: [...tablePath, insertIndex] })
  return [...tablePath, insertIndex]
}

function createRow(cols: number, cellType: string) {
  return {
    type: TABLE_BLOCKS.tr,
    children: Array.from({ length: cols }).map(() => ({
      type: cellType,
      children: [createContent()],
    })),
  }
}

export function buildTableNode(rows = 1, cols = 1, headerText = '') {
  const safeRows = Math.max(1, rows)
  const safeCols = Math.max(1, cols)

  const headerRow = {
    type: TABLE_BLOCKS.tr,
    children: Array.from({ length: safeCols }).map((_, idx) => ({
      type: TABLE_BLOCKS.th,
      children: [createContent(idx === 0 ? headerText : '')],
    })),
  }

  const bodyRows = Array.from({ length: Math.max(0, safeRows - 1) }).map(() => ({
    type: TABLE_BLOCKS.tr,
    children: Array.from({ length: safeCols }).map(() => ({
      type: TABLE_BLOCKS.td,
      children: [createContent()],
    })),
  }))

  return {
    type: TABLE_BLOCKS.table,
    children: [
      { type: TABLE_BLOCKS.thead, children: [headerRow] },
      { type: TABLE_BLOCKS.tbody, children: bodyRows },
    ],
  }
}

export function insertTableWithHeader(
  editor: Editor,
  options?: { rows?: number, cols?: number, at?: any, headerText?: string },
) {
  const tableNode = buildTableNode(options?.rows, options?.cols, options?.headerText ?? '')
  Transforms.insertNodes(editor, tableNode, { at: options?.at })
}

export function rebuildTablePreserveContent(editor: Editor, tablePath: Path, rows: number, cols: number) {
  const safeRows = Math.max(1, rows)
  const safeCols = Math.max(1, cols)
  const bodyRowsCount = Math.max(0, safeRows - 1)

  const tableNode = Node.get(editor, tablePath)
  if (!Element.isElement(tableNode) || tableNode.type !== TABLE_BLOCKS.table) {
    Transforms.removeNodes(editor, { at: tablePath })
    insertTableWithHeader(editor, { rows: safeRows, cols: safeCols, at: tablePath })
    return
  }

  const headerCells: any[] = []
  const bodyRowsCache: any[][] = []

  for (const section of tableNode.children ?? []) {
    if (!Element.isElement(section))
      continue

    const isHeaderSection = section.type === TABLE_BLOCKS.thead
    const isBodySection = section.type === TABLE_BLOCKS.tbody

    for (const row of section.children ?? []) {
      if (!Element.isElement(row))
        continue

      const cells: any[] = []
      for (const cell of row.children ?? []) {
        if (!Element.isElement(cell))
          continue

        const isHeader = isHeaderSection || cell.type === TABLE_BLOCKS.th
        cells.push(cloneCellAs(cell, isHeader ? TABLE_BLOCKS.th : TABLE_BLOCKS.td))
      }

      if (isHeaderSection)
        headerCells.push(...cells)
      else if (isBodySection)
        bodyRowsCache.push(cells)
    }
  }

  const headerRow = {
    type: TABLE_BLOCKS.tr,
    children: Array.from({ length: safeCols }).map((_, idx) => headerCells[idx] ?? emptyCell(TABLE_BLOCKS.th)),
  }

  const bodyRows = Array.from({ length: bodyRowsCount }).map((_, rowIdx) => {
    const existingRow = bodyRowsCache[rowIdx] ?? []
    return {
      type: TABLE_BLOCKS.tr,
      children: Array.from({ length: safeCols }).map((_, colIdx) => existingRow[colIdx] ?? emptyCell(TABLE_BLOCKS.td)),
    }
  })

  const newTable = {
    type: TABLE_BLOCKS.table,
    children: [
      { type: TABLE_BLOCKS.thead, children: [headerRow] },
      { type: TABLE_BLOCKS.tbody, children: bodyRows },
    ],
  }

  Transforms.removeNodes(editor, { at: tablePath })
  Transforms.insertNodes(editor, newTable, { at: tablePath })
}

export function resizeTablePreserveContent(editor: Editor, tablePath: Path, rows: number, cols: number) {
  const safeRows = Math.max(1, rows)
  const safeCols = Math.max(1, cols)
  const tableNode = Node.get(editor, tablePath)

  if (!Element.isElement(tableNode) || tableNode.type !== TABLE_BLOCKS.table) {
    Transforms.removeNodes(editor, { at: tablePath })
    insertTableWithHeader(editor, { rows: safeRows, cols: safeCols, at: tablePath })
    return
  }

  const sections = getTableSections(tableNode)
  const headerSection = sections.find(section => section.type === TABLE_BLOCKS.thead)
  const bodySection = sections.find(section => section.type === TABLE_BLOCKS.tbody)
  const headerRows = headerSection?.rows.length ?? 0
  const currentBodyRows = bodySection?.rows.length ?? 0
  const currentCols = getColumnCount(sections)

  if (currentCols < 1) {
    Transforms.removeNodes(editor, { at: tablePath })
    insertTableWithHeader(editor, { rows: safeRows, cols: safeCols, at: tablePath })
    return
  }

  const desiredRows = Math.max(safeRows, headerRows)
  const desiredBodyRows = Math.max(0, desiredRows - headerRows)

  Editor.withoutNormalizing(editor, () => {
    if (currentCols !== safeCols) {
      if (currentCols < safeCols) {
        const toAdd = safeCols - currentCols
        for (let i = 0; i < toAdd; i++) {
          const anchor = getLastCellPath(editor, tablePath)
          if (!anchor)
            break
          TableEditor.insertColumn(editor, { at: anchor, before: false })
        }
      }
      else {
        const toRemove = currentCols - safeCols
        for (let i = 0; i < toRemove; i++) {
          const anchor = getLastCellPath(editor, tablePath)
          if (!anchor)
            break
          TableEditor.removeColumn(editor, { at: anchor })
        }
      }
    }

    if (currentBodyRows !== desiredBodyRows) {
      if (currentBodyRows < desiredBodyRows) {
        const bodyPath = ensureBodySection(editor, tablePath)
        const bodyNode = Node.get(editor, bodyPath)
        const bodyRows = Element.isElement(bodyNode) && Array.isArray(bodyNode.children)
          ? bodyNode.children.filter(child => Element.isElement(child) && child.type === TABLE_BLOCKS.tr).length
          : 0
        let inserted = bodyRows
        if (inserted === 0) {
          Transforms.insertNodes(editor, createRow(safeCols, TABLE_BLOCKS.td) as any, { at: [...bodyPath, 0] })
          inserted = 1
        }
        const toAdd = desiredBodyRows - inserted
        for (let i = 0; i < toAdd; i++) {
          const anchor = getLastCellPath(editor, tablePath, TABLE_BLOCKS.tbody)
          if (!anchor)
            break
          TableEditor.insertRow(editor, { at: anchor, before: false })
        }
      }
      else {
        const toRemove = currentBodyRows - desiredBodyRows
        for (let i = 0; i < toRemove; i++) {
          const anchor = getLastCellPath(editor, tablePath, TABLE_BLOCKS.tbody)
          if (!anchor)
            break
          TableEditor.removeRow(editor, { at: anchor })
        }
      }
    }
  })
}
