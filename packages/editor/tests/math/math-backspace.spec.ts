import { expect, test } from '@playwright/test'
import {
  focusParagraph,
  getNodeText,
  getTopLevelBlocks,
  getTopLevelOutlineItem,
  gotoMathFixture,
  readMathDoc,
} from './math-test-utils'

test.describe('math backspace interactions', () => {
  test('removes an empty inline math node with Backspace and leaves the paragraph editable', async ({ page }) => {
    // Arrange: create an empty inline math node in the first paragraph.
    await gotoMathFixture(page)
    await focusParagraph(page, 0, 'start')
    await page.keyboard.type('$$ ')

    // Act: delete the empty node and type plain text where it used to be.
    await page.keyboard.press('Backspace')
    await page.keyboard.type('Plain')

    // Assert: the paragraph becomes a normal text paragraph again.
    await expect.poll(async () => {
      const doc = await readMathDoc(page)
      const firstBlocks = getTopLevelBlocks(doc, 0)
      const firstParagraph = firstBlocks[0]

      return {
        topLevelTypes: doc.content?.map(node => node.type) ?? [],
        firstItemType: getTopLevelOutlineItem(doc, 0)?.type,
        firstBlockTypes: firstBlocks.map(node => node.type),
        firstParagraphType: firstParagraph?.type,
        firstParagraphContentTypes: firstParagraph?.content?.map(node => node.type) ?? [],
        firstParagraphText: getNodeText(firstParagraph),
        secondItemText: getNodeText(getTopLevelOutlineItem(doc, 1)),
      }
    }).toEqual({
      topLevelTypes: ['outlineUList', 'outlineUList', 'outlineUList'],
      firstItemType: 'outlineUordItem',
      firstBlockTypes: ['paragraph'],
      firstParagraphType: 'paragraph',
      firstParagraphContentTypes: ['text'],
      firstParagraphText: 'Plain',
      secondItemText: 'Alpha',
    })
  })

  test('replaces an empty block math node with a paragraph on Backspace and keeps the paragraph editable', async ({ page }) => {
    // Arrange: create an empty block math node from the first paragraph.
    await gotoMathFixture(page)
    await focusParagraph(page, 0, 'start')
    await page.keyboard.type('$$$$ ')

    // Act: press Backspace inside the empty block math node and continue typing.
    await page.keyboard.press('Backspace')
    await page.keyboard.type('Plain')

    // Assert: the block math node turns back into a normal paragraph at the same position.
    await expect.poll(async () => {
      const doc = await readMathDoc(page)
      const firstBlocks = getTopLevelBlocks(doc, 0)
      const firstBlock = firstBlocks[0]

      return {
        topLevelTypes: doc.content?.map(node => node.type) ?? [],
        firstItemType: getTopLevelOutlineItem(doc, 0)?.type,
        firstBlockTypes: firstBlocks.map(node => node.type),
        firstBlockType: firstBlock?.type,
        firstBlockText: getNodeText(firstBlock),
        secondItemText: getNodeText(getTopLevelOutlineItem(doc, 1)),
      }
    }).toEqual({
      topLevelTypes: ['outlineUList', 'outlineUList', 'outlineUList'],
      firstItemType: 'outlineUordItem',
      firstBlockTypes: ['paragraph'],
      firstBlockType: 'paragraph',
      firstBlockText: 'Plain',
      secondItemText: 'Alpha',
    })
  })
})
