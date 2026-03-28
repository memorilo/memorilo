import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'
import { complexOutlineMathDocument } from './math-fixtures'
import {
  countNodesByType,
  focusLastParagraph,
  getNodeText,
  getTopLevelBlocks,
  getTopLevelOutlineItem,
  gotoMathFixture,
  pressSelectAllShortcut,
  readMathDoc,
  setMathFixtureContent,
} from './math-test-utils'

function installErrorTrackers(page: Page) {
  const pageErrors: string[] = []
  const consoleErrors: string[] = []

  page.on('pageerror', (error) => {
    pageErrors.push(error.message)
  })
  page.on('console', (message) => {
    if (message.type() === 'error') {
      consoleErrors.push(message.text())
    }
  })

  return { pageErrors, consoleErrors }
}

async function expectClearedOutlineDocument(page: Page) {
  await expect.poll(async () => {
    const doc = await readMathDoc(page)
    const firstItem = getTopLevelOutlineItem(doc, 0)
    const firstBlocks = getTopLevelBlocks(doc, 0)

    return {
      topLevelCount: doc.content?.length ?? 0,
      topLevelTypes: doc.content?.map(node => node.type) ?? [],
      firstItemType: firstItem?.type,
      firstBlockTypes: firstBlocks.map(node => node.type),
      firstItemText: getNodeText(firstItem),
      inlineMathCount: countNodesByType(doc, 'inlineMath'),
      blockMathCount: countNodesByType(doc, 'blockMath'),
    }
  }).toEqual({
    topLevelCount: 1,
    topLevelTypes: ['outlineUList'],
    firstItemType: 'outlineUordItem',
    firstBlockTypes: ['paragraph'],
    firstItemText: '',
    inlineMathCount: 0,
    blockMathCount: 0,
  })
}

test.describe('math document deletion in outline documents', () => {
  test('repeated Backspace from the document end clears a complex outline document without runtime errors', async ({ page }) => {
    // Arrange: load a nested outline document that mixes inline and block formulas.
    await gotoMathFixture(page)
    await setMathFixtureContent(page, complexOutlineMathDocument)
    const { pageErrors, consoleErrors } = installErrorTrackers(page)
    await focusLastParagraph(page)

    // Act: keep deleting backward from the document end until the document is cleared.
    for (let index = 0; index < 120; index += 1) {
      await page.keyboard.press('Backspace')
    }

    // Assert: the editor falls back to a single empty outline item and surfaces no runtime errors.
    await expectClearedOutlineDocument(page)
    expect(pageErrors).toEqual([])
    expect(consoleErrors).toEqual([])
  })

  test('Ctrl+A then Backspace clears a complex outline document without runtime errors', async ({ page }) => {
    // Arrange: load the same nested outline document with multiple formulas.
    await gotoMathFixture(page)
    await setMathFixtureContent(page, complexOutlineMathDocument)
    const { pageErrors, consoleErrors } = installErrorTrackers(page)
    await focusLastParagraph(page)

    // Act: select the entire document and delete the selection.
    await pressSelectAllShortcut(page)
    await page.keyboard.press('Backspace')

    // Assert: the editor falls back to a single empty outline item and surfaces no runtime errors.
    await expectClearedOutlineDocument(page)
    expect(pageErrors).toEqual([])
    expect(consoleErrors).toEqual([])
  })
})
