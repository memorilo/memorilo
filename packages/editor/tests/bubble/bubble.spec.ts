import { expect, test } from '@playwright/test'
import {
  constrainBubbleEditorPanel,
  countBubbleTableRows,
  dragSelectBubbleParagraphText,
  dragSelectBubbleTableCells,
  focusBubbleParagraph,
  focusBubbleTableCell,
  getBubbleButton,
  getBubbleMenu,
  getBubbleTableButton,
  gotoBubbleFixture,
  mergeBubbleSelectedTableCells,
  mountBubbleOcclusionPanel,
  readBubbleHeadingTriggerLayout,
  readBubbleFixtureSelectionState,
  pressInsertTableShortcut,
  readBubbleMenuGapToParagraph,
  readBubbleInlineControlsLayout,
  readBubblePanelOverlapMetrics,
  readBubbleParagraphHtml,
  readBubbleMenuViewportMetrics,
  readBubbleSelectionAlignment,
  selectBubbleTableCells,
  selectBubbleParagraphText,
  setBubbleParagraphTextAlign,
  setBubbleParagraphText,
  selectTableCellText,
} from './bubble-test-utils'

test.describe('bubble menu integration', () => {
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(!testInfo.project.name.startsWith('full'), 'Bubble menu coverage targets the full editor shell')
    await gotoBubbleFixture(page)
  })

  test('shows inline controls for a text selection and toggles bold formatting', async ({ page }) => {
    await selectBubbleParagraphText(page, 0, 0, 5)

    await expect(getBubbleMenu(page)).toBeVisible()

    const boldButton = getBubbleButton(page, 'bold')
    await expect(boldButton).toBeVisible()
    await boldButton.click()

    await expect.poll(async () => {
      return await readBubbleParagraphHtml(page, 0)
    }).toContain('<strong>Alpha</strong>')

    await expect(boldButton).toHaveAttribute('aria-pressed', 'true')
  })

  test('updates the bold button state when the selection moves to plain text', async ({ page }) => {
    await selectBubbleParagraphText(page, 0, 0, 5)

    await expect(getBubbleMenu(page)).toBeVisible()

    const boldButton = getBubbleButton(page, 'bold')
    await boldButton.click()
    await expect(boldButton).toHaveAttribute('aria-pressed', 'true')

    await selectBubbleParagraphText(page, 0, 1, 5)

    await expect(boldButton).toHaveAttribute('aria-pressed', 'false')
  })

  test('shows the current block state and switches between paragraph and heading', async ({ page }) => {
    await selectBubbleParagraphText(page, 0, 0, 5)

    await expect(getBubbleMenu(page)).toBeVisible()
    const headingTrigger = page.getByTestId('bubble-heading-trigger')

    await expect(headingTrigger).toContainText('editor.heading.paragraph')

    await headingTrigger.click()
    await page.getByTestId('bubble-heading-option-2').click()

    await expect(page.locator('[data-testid="bubble-editor"] .ProseMirror h2')).toHaveText('Alpha Beta')
    await expect(headingTrigger).toContainText('editor.heading.level_2')

    await headingTrigger.click()
    await page.getByTestId('bubble-heading-option-paragraph').click()

    await expect(page.locator('[data-testid="bubble-editor"] .ProseMirror p')).toHaveText('Alpha Beta')
    await expect(headingTrigger).toContainText('editor.heading.paragraph')
  })

  test('switches block type after a real mouse drag selection', async ({ page }) => {
    await dragSelectBubbleParagraphText(page, 0, 0, 5)

    await expect(getBubbleMenu(page)).toBeVisible()

    const headingTrigger = page.getByTestId('bubble-heading-trigger')
    await headingTrigger.click()
    await page.getByTestId('bubble-heading-option-2').click()

    await expect(page.locator('[data-testid="bubble-editor"] .ProseMirror h2')).toHaveText('Alpha Beta')
  })

  test('keeps a clear vertical gap between the bubble menu and the selected text', async ({ page }) => {
    await selectBubbleParagraphText(page, 0, 0, 5)

    await expect(getBubbleMenu(page)).toBeVisible()

    await expect.poll(async () => {
      return (await readBubbleMenuGapToParagraph(page, 0)).gap
    }).toBeGreaterThanOrEqual(12)
  })

  test('keeps the bubble menu inside the right viewport edge on a narrow screen', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 900 })
    await gotoBubbleFixture(page)
    await selectBubbleParagraphText(page, 0, 0, 5)

    await expect(getBubbleMenu(page)).toBeVisible()

    const metrics = await readBubbleMenuViewportMetrics(page)
    expect(metrics.rootRight).toBeLessThanOrEqual(metrics.viewportWidth)
    expect(metrics.documentScrollWidth).toBeLessThanOrEqual(metrics.viewportWidth)
  })

  test('keeps inline controls fully visible on a single row on a narrow screen', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 900 })
    await gotoBubbleFixture(page)
    await selectBubbleParagraphText(page, 0, 0, 5)

    await expect(getBubbleMenu(page)).toBeVisible()

    const layout = await readBubbleInlineControlsLayout(page)
    expect(layout.rowTopDelta).toBeLessThanOrEqual(2)
    expect(layout.menuScrollWidth).toBeLessThanOrEqual(layout.menuClientWidth)
    expect(layout.controlsOverflowLeft).toBeLessThanOrEqual(0)
    expect(layout.controlsOverflowRight).toBeLessThanOrEqual(0)
  })

  test('keeps the compact heading indicator visible on a narrow screen', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 900 })
    await gotoBubbleFixture(page)
    await selectBubbleParagraphText(page, 0, 0, 5)

    await expect(getBubbleMenu(page)).toBeVisible()

    const layout = await readBubbleHeadingTriggerLayout(page)
    expect(layout.labelWidth).toBeGreaterThanOrEqual(12)
    expect(layout.labelLeftInset).toBeGreaterThanOrEqual(0)
    expect(layout.labelRightInset).toBeGreaterThanOrEqual(14)
  })

  test('keeps the bubble menu inside the left viewport edge on a narrow screen', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 900 })
    await gotoBubbleFixture(page)
    await setBubbleParagraphTextAlign(page, 0, 'right')
    await selectBubbleParagraphText(page, 0, 6, 10)

    await expect(getBubbleMenu(page)).toBeVisible()

    const metrics = await readBubbleMenuViewportMetrics(page)
    expect(metrics.rootLeft).toBeGreaterThanOrEqual(0)
    expect(metrics.documentScrollWidth).toBeLessThanOrEqual(metrics.viewportWidth)
  })

  test('keeps the bubble menu inside the editor panel when the editor is narrower than the viewport', async ({ page }) => {
    await page.setViewportSize({ width: 900, height: 900 })
    await gotoBubbleFixture(page)
    await constrainBubbleEditorPanel(page, 332)
    await selectBubbleParagraphText(page, 0, 0, 5)

    await expect(getBubbleMenu(page)).toBeVisible()

    const metrics = await readBubbleMenuViewportMetrics(page)
    expect(metrics.rootLeft).toBeGreaterThanOrEqual(metrics.editorLeft)
    expect(metrics.rootRight).toBeLessThanOrEqual(metrics.editorRight)
  })

  test('keeps the selected text horizontally under the compact bubble in a narrow editor panel', async ({ page }) => {
    await page.setViewportSize({ width: 900, height: 900 })
    await gotoBubbleFixture(page)
    await constrainBubbleEditorPanel(page, 332)
    await setBubbleParagraphText(page, 0, 'Alpha Beta Gamma Delta Epsilon Zeta Eta Theta Iota')
    await selectBubbleParagraphText(page, 0, 17, 22)

    await expect(getBubbleMenu(page)).toBeVisible()

    const alignment = await readBubbleSelectionAlignment(page)
    expect(alignment.selectionCenter).toBeGreaterThanOrEqual(alignment.rootLeft + 24)
    expect(alignment.selectionCenter).toBeLessThanOrEqual(alignment.rootRight - 24)
  })

  test('keeps the bubble menu out of the fixed left sidebar column', async ({ page }) => {
    await page.setViewportSize({ width: 900, height: 900 })
    await gotoBubbleFixture(page)
    await mountBubbleOcclusionPanel(page, 260)
    await selectBubbleParagraphText(page, 0, 0, 5)

    await expect(getBubbleMenu(page)).toBeVisible()

    const metrics = await readBubblePanelOverlapMetrics(page)
    expect(metrics.rootLeft).toBeGreaterThanOrEqual(metrics.panelRight)
    expect(metrics.overlapWidth).toBe(0)
  })

  test('shows table controls for table text selections and inserts a row below', async ({ page }) => {
    await focusBubbleParagraph(page, 0)
    await page.keyboard.press('End')
    await page.keyboard.press('Enter')
    await pressInsertTableShortcut(page)

    const table = page.locator('[data-testid="bubble-editor"] .ProseMirror table')
    await expect(table).toHaveCount(1)

    await page.keyboard.type('Cell A')
    await selectTableCellText(page, 0, 0, 0, 6)

    const insertRowBelowButton = getBubbleTableButton(page, 'insert-row-below')
    await expect(getBubbleMenu(page)).toBeVisible()
    await expect(insertRowBelowButton).toBeVisible()

    const rowCountBefore = await countBubbleTableRows(page)
    await insertRowBelowButton.click()

    await expect.poll(async () => {
      return await countBubbleTableRows(page)
    }).toBe(rowCountBefore + 1)
  })

  test('shows the split cell control after returning the caret to a merged table cell', async ({ page }) => {
    await focusBubbleParagraph(page, 0)
    await page.keyboard.press('End')
    await page.keyboard.press('Enter')
    await pressInsertTableShortcut(page)

    await expect(page.locator('[data-testid="bubble-editor"] .ProseMirror table')).toHaveCount(1)

    await selectBubbleTableCells(page, 1, 0, 1, 1)
    await expect(getBubbleTableButton(page, 'merge-cells')).toBeVisible()

    expect(await mergeBubbleSelectedTableCells(page)).toBe(true)

    await focusBubbleTableCell(page, 1, 0)
    await expect.poll(async () => {
      return await readBubbleFixtureSelectionState(page)
    }).toMatchObject({
      empty: true,
      canSplitCell: true,
    })

    await expect(getBubbleMenu(page)).toBeVisible()
    await expect(getBubbleTableButton(page, 'split-cell')).toBeVisible()
  })

  test('shows split and hides merge when a merged cell remains singly selected', async ({ page }) => {
    await focusBubbleParagraph(page, 0)
    await page.keyboard.press('End')
    await page.keyboard.press('Enter')
    await pressInsertTableShortcut(page)

    await expect(page.locator('[data-testid="bubble-editor"] .ProseMirror table')).toHaveCount(1)

    await selectBubbleTableCells(page, 1, 0, 1, 1)
    await expect(getBubbleTableButton(page, 'merge-cells')).toBeVisible()

    await getBubbleTableButton(page, 'merge-cells').click()

    await expect.poll(async () => {
      return await readBubbleFixtureSelectionState(page)
    }).toMatchObject({
      canSplitCell: true,
    })

    await expect(getBubbleMenu(page)).toBeVisible()
    await expect(getBubbleTableButton(page, 'split-cell')).toBeVisible()
    await expect(getBubbleTableButton(page, 'merge-cells')).toHaveCount(0)
  })

  test('shows split and hides merge after merging a mouse-selected cell range', async ({ page }) => {
    await focusBubbleParagraph(page, 0)
    await page.keyboard.press('End')
    await page.keyboard.press('Enter')
    await pressInsertTableShortcut(page)

    await expect(page.locator('[data-testid="bubble-editor"] .ProseMirror table')).toHaveCount(1)

    await dragSelectBubbleTableCells(page, 1, 0, 1, 1)
    await expect(getBubbleTableButton(page, 'merge-cells')).toBeVisible()

    await getBubbleTableButton(page, 'merge-cells').click()

    await expect.poll(async () => {
      return await readBubbleFixtureSelectionState(page)
    }).toMatchObject({
      canSplitCell: true,
    })

    await expect(getBubbleMenu(page)).toBeVisible()
    await expect(getBubbleTableButton(page, 'split-cell')).toBeVisible()
    await expect(getBubbleTableButton(page, 'merge-cells')).toHaveCount(0)
  })

  test('restores a body cell when a merged header and body cell is split', async ({ page }) => {
    await focusBubbleParagraph(page, 0)
    await page.keyboard.press('End')
    await page.keyboard.press('Enter')
    await pressInsertTableShortcut(page)

    await expect(page.locator('[data-testid="bubble-editor"] .ProseMirror table')).toHaveCount(1)

    await selectBubbleTableCells(page, 0, 0, 1, 0)
    await expect(getBubbleTableButton(page, 'merge-cells')).toBeVisible()
    expect(await mergeBubbleSelectedTableCells(page)).toBe(true)

    await focusBubbleTableCell(page, 0, 0)
    await expect(getBubbleTableButton(page, 'split-cell')).toBeVisible()
    await getBubbleTableButton(page, 'split-cell').click()

    await expect.poll(async () => {
      return await page.evaluate(() => {
        const rows = Array.from(document.querySelectorAll('[data-testid="bubble-editor"] .ProseMirror table tr'))
        return rows.map(row =>
          Array.from(row.querySelectorAll('th, td')).map(cell => cell.tagName.toLowerCase()),
        )
      })
    }).toMatchObject({
      0: ['th', 'th', 'th'],
      1: ['td', 'td', 'td'],
    })
  })
})
