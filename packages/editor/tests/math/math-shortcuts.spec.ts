import { expect, test } from '@playwright/test'
import {
  focusParagraph,
  getNodeText,
  getTopLevelBlocks,
  getTopLevelOutlineItem,
  gotoMathFixture,
  pressBlockMathShortcut,
  pressInlineMathShortcut,
  readMathDoc,
  selectTextInParagraph,
} from './math-test-utils'

test.describe('math keyboard shortcuts', () => {
  test('wraps the selected text in inline math with Mod-Shift-M and keeps typing inside the formula', async ({ page }) => {
    // Arrange: select the full text of the second paragraph.
    await gotoMathFixture(page)
    await selectTextInParagraph(page, 1, 0, 5)

    // Act: convert the selection into inline math and append more formula text.
    await pressInlineMathShortcut(page)
    await page.keyboard.type('+1')

    // Assert: the paragraph now contains a single inline math node with the original selection plus the new input.
    await expect.poll(async () => {
      const doc = await readMathDoc(page)
      const secondItem = getTopLevelOutlineItem(doc, 1)
      const secondBlocks = getTopLevelBlocks(doc, 1)
      const secondParagraph = secondBlocks[0]
      const inlineMath = secondParagraph?.content?.[0]

      return {
        topLevelTypes: doc.content?.map(node => node.type) ?? [],
        secondItemType: secondItem?.type,
        secondBlockTypes: secondBlocks.map(node => node.type),
        secondParagraphType: secondParagraph?.type,
        secondParagraphContentTypes: secondParagraph?.content?.map(node => node.type) ?? [],
        inlineMathText: getNodeText(inlineMath),
        thirdItemText: getNodeText(getTopLevelOutlineItem(doc, 2)),
      }
    }).toEqual({
      topLevelTypes: ['outlineUList', 'outlineUList', 'outlineUList'],
      secondItemType: 'outlineUordItem',
      secondBlockTypes: ['paragraph'],
      secondParagraphType: 'paragraph',
      secondParagraphContentTypes: ['inlineMath'],
      inlineMathText: 'Alpha+1',
      thirdItemText: 'Beta',
    })
  })

  test('replaces the current paragraph with block math using Mod-Alt-M and keeps typing inside the formula', async ({ page }) => {
    // Arrange: place the caret inside the third paragraph.
    await gotoMathFixture(page)
    await focusParagraph(page, 2)

    // Act: replace the current block with block math and type the formula content.
    await pressBlockMathShortcut(page)
    await page.keyboard.type('x^2')

    // Assert: only the current paragraph is replaced and the typed content lands inside the block math node.
    await expect.poll(async () => {
      const doc = await readMathDoc(page)
      const thirdBlocks = getTopLevelBlocks(doc, 2)
      const thirdBlock = thirdBlocks[0]

      return {
        topLevelTypes: doc.content?.map(node => node.type) ?? [],
        secondItemText: getNodeText(getTopLevelOutlineItem(doc, 1)),
        thirdBlockTypes: thirdBlocks.map(node => node.type),
        thirdBlockType: thirdBlock?.type,
        thirdBlockText: getNodeText(thirdBlock),
      }
    }).toEqual({
      topLevelTypes: ['outlineUList', 'outlineUList', 'outlineUList'],
      secondItemText: 'Alpha',
      thirdBlockTypes: ['blockMath'],
      thirdBlockType: 'blockMath',
      thirdBlockText: 'x^2',
    })
  })
})
