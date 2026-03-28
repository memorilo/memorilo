import type { Page } from '@playwright/test'
import type { JsonNode } from '../editor-test-utils'
import process from 'node:process'
import { expect } from '@playwright/test'
import {
  focusParagraph,
  getNodeText,
  readFixtureDoc,
} from '../editor-test-utils'

const modifier = process.platform === 'darwin' ? 'Meta' : 'Control'

export function collectNodesByType(root: JsonNode, type: string): JsonNode[] {
  const matches: JsonNode[] = []

  const walk = (node: JsonNode | undefined) => {
    if (!node) {
      return
    }

    if (node.type === type) {
      matches.push(node)
    }

    for (const child of node.content ?? []) {
      walk(child)
    }
  }

  walk(root)
  return matches
}

export function summarizeFirstTable(doc: JsonNode) {
  const tables = collectNodesByType(doc, 'table')
  const firstTable = tables[0]
  if (!firstTable) {
    return null
  }

  const rows = firstTable.content ?? []
  const firstRow = rows[0]
  const secondRow = rows[1]

  return {
    tableCount: tables.length,
    rowCount: rows.length,
    columnCount: firstRow?.content?.length ?? 0,
    firstRowCellTypes: (firstRow?.content ?? []).map(cell => cell.type),
    secondRowCellTypes: (secondRow?.content ?? []).map(cell => cell.type),
    cellTexts: rows.map(row => (row.content ?? []).map(cell => getNodeText(cell))),
  }
}

export async function gotoTableFixture(page: Page) {
  await page.goto('table/')
  await expect(page.getByTestId('table-editor')).toBeVisible()
  await page.waitForSelector('[data-testid="table-editor"] .ProseMirror p', { state: 'visible' })
}

export async function readTableDoc(page: Page): Promise<JsonNode> {
  return readFixtureDoc(page, 'table-json')
}

export async function focusTableParagraph(
  page: Page,
  index: number,
  edge: 'start' | 'end' = 'end',
) {
  await focusParagraph(page, 'table-editor', index, edge)
}

export async function pressInsertTableShortcut(page: Page) {
  await page.keyboard.press(`${modifier}+Alt+t`)
}

export async function focusTableCell(
  page: Page,
  rowIndex: number,
  columnIndex: number,
  edge: 'start' | 'end' = 'end',
) {
  await page.waitForFunction(({ row, col }) => {
    const rows = document.querySelectorAll('[data-testid="table-editor"] .ProseMirror table tr')
    const currentRow = rows.item(row)
    if (!(currentRow instanceof HTMLTableRowElement)) {
      return false
    }

    const currentCell = currentRow.querySelectorAll('th, td').item(col)
    if (!(currentCell instanceof HTMLTableCellElement)) {
      return false
    }

    const paragraph = currentCell.querySelector('p')
    return paragraph instanceof HTMLParagraphElement && paragraph.getClientRects().length > 0
  }, { row: rowIndex, col: columnIndex })

  await page.evaluate(({ row, col, targetEdge }) => {
    const rows = document.querySelectorAll('[data-testid="table-editor"] .ProseMirror table tr')
    const currentRow = rows.item(row)
    if (!(currentRow instanceof HTMLTableRowElement)) {
      throw new TypeError(`Table row ${row} not found`)
    }

    const currentCell = currentRow.querySelectorAll('th, td').item(col)
    if (!(currentCell instanceof HTMLTableCellElement)) {
      throw new TypeError(`Table cell ${row}:${col} not found`)
    }

    const paragraph = currentCell.querySelector('p')
    if (!(paragraph instanceof HTMLParagraphElement)) {
      throw new TypeError(`Paragraph for table cell ${row}:${col} not found`)
    }

    const editor = paragraph.closest('.ProseMirror')
    if (!(editor instanceof HTMLElement)) {
      throw new TypeError('Editor root not found')
    }

    editor.focus()

    const selection = window.getSelection()
    if (!selection) {
      throw new TypeError('Window selection is unavailable')
    }

    const range = document.createRange()
    const walker = document.createTreeWalker(paragraph, NodeFilter.SHOW_TEXT)

    let firstTextNode: Text | null = null
    let lastTextNode: Text | null = null
    while (walker.nextNode()) {
      const textNode = walker.currentNode as Text
      if (!firstTextNode) {
        firstTextNode = textNode
      }
      lastTextNode = textNode
    }

    if (targetEdge === 'start') {
      if (firstTextNode) {
        range.setStart(firstTextNode, 0)
      }
      else {
        range.setStart(paragraph, 0)
      }
    }
    else if (lastTextNode) {
      range.setStart(lastTextNode, lastTextNode.textContent?.length ?? 0)
    }
    else {
      range.setStart(paragraph, paragraph.childNodes.length)
    }

    range.collapse(true)
    selection.removeAllRanges()
    selection.addRange(range)
    document.dispatchEvent(new Event('selectionchange'))
  }, { row: rowIndex, col: columnIndex, targetEdge: edge })
}

export async function selectTableCells(
  page: Page,
  anchorRow: number,
  anchorCol: number,
  headRow: number,
  headCol: number,
) {
  await page.evaluate(({ startRow, startCol, endRow, endCol }) => {
    if (!window.__tableFixture) {
      throw new TypeError('Table fixture helpers are unavailable')
    }

    window.__tableFixture.selectTableCells(startRow, startCol, endRow, endCol)
  }, {
    startRow: anchorRow,
    startCol: anchorCol,
    endRow: headRow,
    endCol: headCol,
  })
}

export async function selectTableRows(
  page: Page,
  anchorRow: number,
  headRow: number,
) {
  await page.evaluate(({ startRow, endRow }) => {
    if (!window.__tableFixture) {
      throw new TypeError('Table fixture helpers are unavailable')
    }

    window.__tableFixture.selectTableRows(startRow, endRow)
  }, {
    startRow: anchorRow,
    endRow: headRow,
  })
}

export async function selectTableColumns(
  page: Page,
  anchorCol: number,
  headCol: number,
) {
  await page.evaluate(({ startCol, endCol }) => {
    if (!window.__tableFixture) {
      throw new TypeError('Table fixture helpers are unavailable')
    }

    window.__tableFixture.selectTableColumns(startCol, endCol)
  }, {
    startCol: anchorCol,
    endCol: headCol,
  })
}

export async function mergeSelectedTableCells(page: Page) {
  return await page.evaluate(() => {
    if (!window.__tableFixture) {
      throw new TypeError('Table fixture helpers are unavailable')
    }

    return window.__tableFixture.mergeSelectedCells()
  })
}

export async function focusGapCursorAfterTable(page: Page) {
  return await page.evaluate(() => {
    if (!window.__tableFixture) {
      throw new TypeError('Table fixture helpers are unavailable')
    }

    return window.__tableFixture.focusGapCursorAfterTable()
  })
}
