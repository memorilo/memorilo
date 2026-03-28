import { expect, test } from '@playwright/test'
import {
  createNestedChild,
  focusParagraph,
  focusParagraphByText,
  gotoOutlineFixture,
  readOutlineDoc,
} from './outline-test-utils'

test.describe('outline ordered marker interactions', () => {
  test('converts a nested child into an ordered item when typing a numbered marker', async ({ page }) => {
    // Arrange: create a nested child under the initial top-level item.
    await gotoOutlineFixture(page)

    await focusParagraph(page, 0)
    await page.keyboard.press('Enter')
    await page.keyboard.press('Tab')

    // Act: type an ordered-list marker at the beginning of the nested item.
    await page.keyboard.type('1. Ordered child')

    // Assert: the nested branch is converted into an ordered item under an ordered parent list.
    await expect.poll(async () => {
      const doc = await readOutlineDoc(page)
      const rootList = doc.content?.[0]
      const nestedList = rootList?.content?.[1]
      const nestedItem = nestedList?.content?.[0]

      return {
        topLevelCount: doc.content?.length ?? 0,
        rootListType: rootList?.type,
        nestedListType: nestedList?.type,
        nestedItemType: nestedItem?.type,
        nestedText: nestedItem?.content?.[0]?.content?.[0]?.text,
      }
    }).toEqual({
      topLevelCount: 1,
      rootListType: 'outlineOrdList',
      nestedListType: 'outlineUList',
      nestedItemType: 'outlineOrdItem',
      nestedText: 'Ordered child',
    })
  })

  test('does not convert a top-level item into ordered when typing a numbered marker', async ({ page }) => {
    // Arrange: place the caret at the start of the top-level item.
    await gotoOutlineFixture(page)
    await focusParagraph(page, 0, 'start')

    // Act: type an ordered-list marker in the top-level item.
    await page.keyboard.type('1. ')

    // Assert: the top-level item remains unordered and keeps the typed marker as text.
    await expect.poll(async () => {
      const doc = await readOutlineDoc(page)
      return {
        rootListType: doc.content?.[0]?.type,
        firstItemType: doc.content?.[0]?.content?.[0]?.type,
        firstText: doc.content?.[0]?.content?.[0]?.content?.[0]?.content?.[0]?.text,
      }
    }).toEqual({
      rootListType: 'outlineUList',
      firstItemType: 'outlineUordItem',
      firstText: '1. Alpha',
    })
  })

  test('does not convert a child into ordered when its parent already has multiple child branches', async ({ page }) => {
    // Arrange: create two child branches under the top-level item.
    await gotoOutlineFixture(page)
    await createNestedChild(page, 'Beta')

    await focusParagraphByText(page, 'Alpha')
    await page.keyboard.press('Enter')
    await page.keyboard.type('Gamma')

    // Act: move to the start of the new child item and type an ordered-list marker.
    await focusParagraphByText(page, 'Gamma', 'start')
    await page.keyboard.type('1. ')

    // Assert: the parent list stays unordered and both child items stay unordered.
    await expect.poll(async () => {
      const doc = await readOutlineDoc(page)
      const childLists = doc.content?.[0]?.content?.slice(1) ?? []
      const childTexts = childLists
        .map(node => node.content?.[0]?.content?.[0]?.content?.[0]?.text ?? '')
        .sort()

      return {
        rootListType: doc.content?.[0]?.type,
        childItemTypes: childLists.map(node => node.content?.[0]?.type),
        childTexts,
      }
    }).toEqual({
      rootListType: 'outlineUList',
      childItemTypes: ['outlineUordItem', 'outlineUordItem'],
      childTexts: ['1. Gamma', 'Beta'],
    })
  })
})
