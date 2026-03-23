import { expect, test } from '@playwright/test'
import {
  focusParagraph,
  getTopLevelBlocks,
  getNodeText,
  getTopLevelOutlineItem,
  gotoMathFixture,
  readMathDoc,
} from './math-test-utils'

test.describe('math input rules', () => {
  test('creates an inline math node from "$$ " at the start of an empty paragraph and keeps typing inside the formula', async ({ page }) => {
    // Arrange: place the caret inside the empty first paragraph.
    await gotoMathFixture(page)
    await focusParagraph(page, 0, 'start')

    // Act: trigger the inline math input rule and keep typing.
    await page.keyboard.type('$$ ')
    await page.keyboard.type('x^2')

    // Assert: the paragraph now contains one inline math node with the typed formula text.
    await expect.poll(async () => {
      const doc = await readMathDoc(page)
      const firstItem = getTopLevelOutlineItem(doc, 0)
      const firstBlocks = getTopLevelBlocks(doc, 0)
      const firstParagraph = firstBlocks[0]
      const inlineMath = firstParagraph?.content?.[0]

      return {
        topLevelTypes: doc.content?.map(node => node.type) ?? [],
        firstItemType: firstItem?.type,
        firstBlockTypes: firstBlocks.map(node => node.type),
        firstParagraphType: firstParagraph?.type,
        firstParagraphContentTypes: firstParagraph?.content?.map(node => node.type) ?? [],
        inlineMathText: getNodeText(inlineMath),
        secondItemText: getNodeText(getTopLevelOutlineItem(doc, 1)),
      }
    }).toEqual({
      topLevelTypes: ['outlineUList', 'outlineUList', 'outlineUList'],
      firstItemType: 'outlineUordItem',
      firstBlockTypes: ['paragraph'],
      firstParagraphType: 'paragraph',
      firstParagraphContentTypes: ['inlineMath'],
      inlineMathText: 'x^2',
      secondItemText: 'Alpha',
    })
  })

  test('preserves preceding text when "$$ " converts the trailing input into inline math', async ({ page }) => {
    // Arrange: place the caret at the end of the plain-text paragraph.
    await gotoMathFixture(page)
    await focusParagraph(page, 1)

    // Act: create an inline formula after the existing text and continue typing into it.
    await page.keyboard.type('$$ ')
    await page.keyboard.type('y+1')

    // Assert: the paragraph keeps its original text before the new inline math node.
    await expect.poll(async () => {
      const doc = await readMathDoc(page)
      const secondBlocks = getTopLevelBlocks(doc, 1)
      const secondParagraph = secondBlocks[0]
      const secondParagraphContent = secondParagraph?.content ?? []
      const inlineMath = secondParagraphContent.find(node => node.type === 'inlineMath')
      const leadingText = secondParagraphContent.find(node => node.type === 'text')

      return {
        topLevelTypes: doc.content?.map(node => node.type) ?? [],
        secondParagraphType: secondParagraph?.type,
        secondBlockTypes: secondBlocks.map(node => node.type),
        secondParagraphContentTypes: secondParagraphContent.map(node => node.type),
        leadingText: getNodeText(leadingText),
        inlineMathText: getNodeText(inlineMath),
        thirdItemText: getNodeText(getTopLevelOutlineItem(doc, 2)),
      }
    }).toEqual({
      topLevelTypes: ['outlineUList', 'outlineUList', 'outlineUList'],
      secondParagraphType: 'paragraph',
      secondBlockTypes: ['paragraph'],
      secondParagraphContentTypes: ['text', 'inlineMath'],
      leadingText: 'Alpha',
      inlineMathText: 'y+1',
      thirdItemText: 'Beta',
    })
  })

  test('creates a block math node from "$$$$ " and keeps typing inside the formula', async ({ page }) => {
    // Arrange: place the caret inside the empty first paragraph.
    await gotoMathFixture(page)
    await focusParagraph(page, 0, 'start')

    // Act: trigger the block math input rule and keep typing.
    await page.keyboard.type('$$$$ ')
    await page.keyboard.type('z^2')

    // Assert: the first top-level block is replaced with block math and receives the typed formula text.
    await expect.poll(async () => {
      const doc = await readMathDoc(page)
      const firstItem = getTopLevelOutlineItem(doc, 0)
      const firstBlocks = getTopLevelBlocks(doc, 0)
      const firstBlock = firstBlocks[0]

      return {
        topLevelTypes: doc.content?.map(node => node.type) ?? [],
        firstItemType: firstItem?.type,
        firstBlockTypes: firstBlocks.map(node => node.type),
        firstBlockType: firstBlock?.type,
        firstBlockText: getNodeText(firstBlock),
        secondItemText: getNodeText(getTopLevelOutlineItem(doc, 1)),
      }
    }).toEqual({
      topLevelTypes: ['outlineUList', 'outlineUList', 'outlineUList'],
      firstItemType: 'outlineUordItem',
      firstBlockTypes: ['blockMath'],
      firstBlockType: 'blockMath',
      firstBlockText: 'z^2',
      secondItemText: 'Alpha',
    })
  })
})
