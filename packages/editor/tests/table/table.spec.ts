import { expect, test } from '@playwright/test'
import {
  countBubbleTableRows,
  focusBubbleParagraph,
  getBubbleTableButton,
  gotoBubbleFixture,
  pressInsertTableShortcut as pressBubbleInsertTableShortcut,
  selectTableCellText as selectBubbleTableCellText,
} from '../bubble/bubble-test-utils'
import {
  focusGapCursorAfterTable,
  focusTableCell,
  focusTableParagraph,
  gotoTableFixture,
  mergeSelectedTableCells,
  pressInsertTableShortcut,
  readTableDoc,
  selectTableCells,
  selectTableColumns,
  selectTableRows,
  summarizeFirstTable,
} from './table-test-utils'

test.describe('table extension', () => {
  test('inserts a 3x3 table with a header row and keeps typing in the active cell', async ({ page }) => {
    await gotoTableFixture(page)
    await focusTableParagraph(page, 0)

    await pressInsertTableShortcut(page)
    await page.keyboard.type('Alpha')

    await expect.poll(async () => {
      return summarizeFirstTable(await readTableDoc(page))
    }).toEqual({
      tableCount: 1,
      rowCount: 3,
      columnCount: 3,
      firstRowCellTypes: ['tableHeader', 'tableHeader', 'tableHeader'],
      secondRowCellTypes: ['tableCell', 'tableCell', 'tableCell'],
      cellTexts: [
        ['Alpha', '', ''],
        ['', '', ''],
        ['', '', ''],
      ],
    })
  })

  test('persists edits in both header and body cells without changing table structure', async ({ page }) => {
    await gotoTableFixture(page)
    await focusTableParagraph(page, 0)

    await pressInsertTableShortcut(page)
    await page.keyboard.type('Head')

    await focusTableCell(page, 1, 1)
    await page.keyboard.type('Body')

    await expect.poll(async () => {
      return summarizeFirstTable(await readTableDoc(page))
    }).toEqual({
      tableCount: 1,
      rowCount: 3,
      columnCount: 3,
      firstRowCellTypes: ['tableHeader', 'tableHeader', 'tableHeader'],
      secondRowCellTypes: ['tableCell', 'tableCell', 'tableCell'],
      cellTexts: [
        ['Head', '', ''],
        ['', 'Body', ''],
        ['', '', ''],
      ],
    })
  })

  test('does not insert a nested second table when the shortcut is pressed inside an existing table', async ({ page }) => {
    await gotoTableFixture(page)
    await focusTableParagraph(page, 0)

    await pressInsertTableShortcut(page)
    await page.keyboard.type('Alpha')
    await focusTableCell(page, 0, 0)

    await pressInsertTableShortcut(page)

    await expect.poll(async () => {
      return summarizeFirstTable(await readTableDoc(page))
    }).toEqual({
      tableCount: 1,
      rowCount: 3,
      columnCount: 3,
      firstRowCellTypes: ['tableHeader', 'tableHeader', 'tableHeader'],
      secondRowCellTypes: ['tableCell', 'tableCell', 'tableCell'],
      cellTexts: [
        ['Alpha', '', ''],
        ['', '', ''],
        ['', '', ''],
      ],
    })
  })

  test('deletes a selected row with Backspace even when the row contains merged cells', async ({ page }) => {
    await gotoTableFixture(page)
    await focusTableParagraph(page, 0)

    await pressInsertTableShortcut(page)
    await selectTableCells(page, 1, 0, 1, 1)
    expect(await mergeSelectedTableCells(page)).toBe(true)
    await focusTableCell(page, 1, 0)
    await page.keyboard.type('Merged row')
    await selectTableRows(page, 1, 1)

    await page.keyboard.press('Backspace')

    await expect.poll(async () => {
      const summary = summarizeFirstTable(await readTableDoc(page))
      if (!summary) {
        return null
      }

      return {
        rowCount: summary.rowCount,
        columnCount: summary.columnCount,
        flattenedText: summary.cellTexts.flat(),
      }
    }).toEqual({
      rowCount: 2,
      columnCount: 3,
      flattenedText: ['', '', '', '', '', ''],
    })
  })

  test('does not delete the header row when Backspace is pressed on a selected table header', async ({ page }) => {
    await gotoTableFixture(page)
    await focusTableParagraph(page, 0)

    await pressInsertTableShortcut(page)
    await page.keyboard.type('Head')
    await selectTableRows(page, 0, 0)

    await page.keyboard.press('Backspace')

    await expect.poll(async () => summarizeFirstTable(await readTableDoc(page))).toEqual({
      tableCount: 1,
      rowCount: 3,
      columnCount: 3,
      firstRowCellTypes: ['tableHeader', 'tableHeader', 'tableHeader'],
      secondRowCellTypes: ['tableCell', 'tableCell', 'tableCell'],
      cellTexts: [
        ['Head', '', ''],
        ['', '', ''],
        ['', '', ''],
      ],
    })
  })

  test('deletes selected columns with Backspace even when the selection contains merged cells', async ({ page }) => {
    await gotoTableFixture(page)
    await focusTableParagraph(page, 0)

    await pressInsertTableShortcut(page)
    await selectTableCells(page, 1, 1, 1, 2)
    expect(await mergeSelectedTableCells(page)).toBe(true)
    await focusTableCell(page, 1, 1)
    await page.keyboard.type('Merged columns')
    await selectTableColumns(page, 1, 2)

    await page.keyboard.press('Backspace')

    await expect.poll(async () => {
      const summary = summarizeFirstTable(await readTableDoc(page))
      if (!summary) {
        return null
      }

      return {
        rowCount: summary.rowCount,
        columnCount: summary.columnCount,
        flattenedText: summary.cellTexts.flat(),
      }
    }).toEqual({
      rowCount: 3,
      columnCount: 1,
      flattenedText: ['', '', ''],
    })
  })

  test('asks for confirmation before deleting a selected table with Backspace in the full editor shell', async ({ page }, testInfo) => {
    test.skip(!testInfo.project.name.startsWith('full'), 'Table delete confirmation is only mounted in the full editor shell')

    await gotoTableFixture(page)
    await focusTableParagraph(page, 0)

    await pressInsertTableShortcut(page)
    await selectTableRows(page, 0, 2)

    await page.keyboard.press('Backspace')

    await expect(page.getByTestId('table-delete-alert')).toBeVisible()
    await expect.poll(async () => summarizeFirstTable(await readTableDoc(page))).toMatchObject({
      tableCount: 1,
    })

    await page.getByTestId('table-delete-alert-cancel').click()
    await expect(page.getByTestId('table-delete-alert')).toHaveCount(0)

    await selectTableRows(page, 0, 2)
    await page.keyboard.press('Backspace')
    await expect(page.getByTestId('table-delete-alert')).toBeVisible()
    await page.getByTestId('table-delete-alert-confirm').click()

    await expect.poll(async () => summarizeFirstTable(await readTableDoc(page))).toBeNull()
  })

  test('asks for confirmation before deleting a table from the trailing gapcursor in the full editor shell', async ({ page }, testInfo) => {
    test.skip(!testInfo.project.name.startsWith('full'), 'Gapcursor-backed table delete confirmation is only mounted in the full editor shell')

    await gotoTableFixture(page)
    await focusTableParagraph(page, 0)

    await pressInsertTableShortcut(page)
    expect(await focusGapCursorAfterTable(page)).toBe(true)

    await page.keyboard.press('Backspace')

    await expect(page.getByTestId('table-delete-alert')).toBeVisible()
    await page.getByTestId('table-delete-alert-confirm').click()

    await expect.poll(async () => summarizeFirstTable(await readTableDoc(page))).toBeNull()
  })

  test('resizes the table and removes the header row from bubble settings in the full editor shell', async ({ page }, testInfo) => {
    test.skip(!testInfo.project.name.startsWith('full'), 'Settings UI is only mounted in the full editor shell')

    await gotoBubbleFixture(page)
    await focusBubbleParagraph(page, 0)
    await page.keyboard.press('End')
    await page.keyboard.press('Enter')
    await pressBubbleInsertTableShortcut(page)
    await page.keyboard.type('Head')
    await selectBubbleTableCellText(page, 0, 0, 0, 4)

    await page.getByTestId('bubble-table-settings').click()
    await page.getByTestId('bubble-table-header-switch').click()
    await page.getByTestId('bubble-table-rows-input').fill('4')
    await page.getByTestId('bubble-table-columns-input').fill('2')
    await page.getByTestId('bubble-table-apply').click()

    const firstRow = page.locator('[data-testid="bubble-editor"] .ProseMirror table tr').first()
    await expect.poll(async () => {
      return {
        rowCount: await countBubbleTableRows(page),
        headerCellCount: await firstRow.locator('th').count(),
        bodyCellCount: await firstRow.locator('td').count(),
      }
    }).toEqual({
      rowCount: 4,
      headerCellCount: 0,
      bodyCellCount: 2,
    })
  })

  test('applies center alignment to the selected cell from the bubble table controls in the full editor shell', async ({ page }, testInfo) => {
    test.skip(!testInfo.project.name.startsWith('full'), 'Bubble table controls are only mounted in the full editor shell')

    await gotoBubbleFixture(page)
    await focusBubbleParagraph(page, 0)
    await page.keyboard.press('End')
    await page.keyboard.press('Enter')
    await pressBubbleInsertTableShortcut(page)
    await page.keyboard.type('Head')
    await selectBubbleTableCellText(page, 0, 0, 0, 4)

    await getBubbleTableButton(page, 'align-center').click()

    const firstCell = page.locator('[data-testid="bubble-editor"] .ProseMirror table tr').first().locator('th, td').first()
    await expect(firstCell).toHaveClass(/tableAlignCenter/)
  })
})
