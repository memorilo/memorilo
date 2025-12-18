import type { Editor, Path } from 'slate'
import type { MemoriloEditor } from '../slate'
import { Element, Node, Transforms } from 'slate'
import { withTable as slateWithTable } from 'slate-table'

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

export function withTable(editor: MemoriloEditor): MemoriloEditor {
  return slateWithTable(editor, {
    blocks: TABLE_BLOCKS,
  })
}

export function buildTableNode(rows = 1, cols = 1, headerText = '') {
  const safeRows = Math.max(1, rows)
  const safeCols = Math.max(1, cols)

  const headerRow = {
    type: TABLE_BLOCKS.tr,
    children: Array.from({ length: safeCols }).map((_, idx) => ({
      type: TABLE_BLOCKS.th,
      children: [
        { type: TABLE_BLOCKS.content, children: [{ text: idx === 0 ? headerText : '' }] },
      ],
    })),
  }

  const bodyRows = Array.from({ length: Math.max(0, safeRows - 1) }).map(() => ({
    type: TABLE_BLOCKS.tr,
    children: Array.from({ length: safeCols }).map(() => ({
      type: TABLE_BLOCKS.td,
      children: [
        { type: TABLE_BLOCKS.content, children: [{ text: '' }] },
      ],
    })),
  }))

  return {
    type: TABLE_BLOCKS.table,
    children: [
      {
        type: TABLE_BLOCKS.thead,
        children: [headerRow],
      },
      {
        type: TABLE_BLOCKS.tbody,
        children: bodyRows,
      },
    ],
  }
}

export function insertTableWithHeader(editor: Editor, options?: { rows?: number, cols?: number, at?: any, headerText?: string }) {
  const tableNode = buildTableNode(options?.rows, options?.cols, options?.headerText ?? '')
  Transforms.insertNodes(editor, tableNode, { at: options?.at })
}

function deepClone<T>(value: T): T {
  if (typeof structuredClone === 'function')
    return structuredClone(value)
  return JSON.parse(JSON.stringify(value))
}

function ensureContent(children: any[]) {
  if (children && children.length > 0)
    return deepClone(children)
  return [{ type: TABLE_BLOCKS.content, children: [{ text: '' }] }]
}

function cloneCellAs(cell: any, type: string) {
  return {
    type,
    rowSpan: cell?.rowSpan,
    colSpan: cell?.colSpan,
    align: cell?.align,
    children: ensureContent(cell?.children ?? []),
  }
}

function emptyCell(type: string) {
  return {
    type,
    children: [{ type: TABLE_BLOCKS.content, children: [{ text: '' }] }],
  }
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
      if (isHeaderSection) {
        headerCells.push(...cells)
      }
      else if (isBodySection) {
        bodyRowsCache.push(cells)
      }
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
      {
        type: TABLE_BLOCKS.thead,
        children: [headerRow],
      },
      {
        type: TABLE_BLOCKS.tbody,
        children: bodyRows,
      },
    ],
  }

  Transforms.removeNodes(editor, { at: tablePath })
  Transforms.insertNodes(editor, newTable, { at: tablePath })
}
