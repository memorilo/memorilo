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
  focusTableCell,
  focusTableParagraph,
  gotoTableFixture,
  pressInsertTableShortcut,
  readTableDoc,
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
