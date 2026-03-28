import { expect, test } from '@playwright/test'
import {
  focusParagraph,
  gotoOutlineFixture,
  readOutlineDoc,
} from './outline-test-utils'

test.describe('outline indent interactions', () => {
  test('moves an outline item into and back out of a nested level with Tab and Shift+Tab', async ({ page }) => {
    // Arrange: create a sibling item that can be moved into a nested level.
    await gotoOutlineFixture(page)

    await focusParagraph(page, 0)
    await page.keyboard.press('Enter')
    await page.keyboard.type('Beta')

    // Act: indent the new item to make it a child of the previous item.
    await page.keyboard.press('Tab')

    // Assert: the item is now represented as a nested unordered child.
    await expect.poll(async () => {
      const doc = await readOutlineDoc(page)
      return {
        topLevelCount: doc.content?.length ?? 0,
        nestedListType: doc.content?.[0]?.content?.[1]?.type,
        nestedItemType: doc.content?.[0]?.content?.[1]?.content?.[0]?.type,
        nestedText: doc.content?.[0]?.content?.[1]?.content?.[0]?.content?.[0]?.content?.[0]?.text,
      }
    }).toEqual({
      topLevelCount: 1,
      nestedListType: 'outlineUList',
      nestedItemType: 'outlineUordItem',
      nestedText: 'Beta',
    })

    // Act: unindent the nested item back to the top level.
    await page.keyboard.press('Shift+Tab')

    // Assert: the item is restored as a top-level sibling.
    await expect.poll(async () => {
      const doc = await readOutlineDoc(page)
      return {
        topLevelCount: doc.content?.length ?? 0,
        secondListType: doc.content?.[1]?.type,
        secondText: doc.content?.[1]?.content?.[0]?.content?.[0]?.content?.[0]?.text,
      }
    }).toEqual({
      topLevelCount: 2,
      secondListType: 'outlineUList',
      secondText: 'Beta',
    })
  })

  test('keeps the first top-level item at the top level when Tab is pressed', async ({ page }) => {
    // Arrange: open the fixture with the initial top-level item.
    await gotoOutlineFixture(page)

    // Act: attempt to indent the first top-level item.
    await focusParagraph(page, 0)
    await page.keyboard.press('Tab')

    // Assert: the document remains unchanged.
    await expect.poll(async () => {
      const doc = await readOutlineDoc(page)
      return {
        topLevelCount: doc.content?.length ?? 0,
        rootChildCount: doc.content?.[0]?.content?.length ?? 0,
        firstText: doc.content?.[0]?.content?.[0]?.content?.[0]?.content?.[0]?.text,
      }
    }).toEqual({
      topLevelCount: 1,
      rootChildCount: 1,
      firstText: 'Alpha',
    })
  })

  test('keeps a top-level item at the top level when Shift+Tab is pressed', async ({ page }) => {
    // Arrange: open the fixture with the initial top-level item.
    await gotoOutlineFixture(page)

    // Act: attempt to unindent the top-level item.
    await focusParagraph(page, 0)
    await page.keyboard.press('Shift+Tab')

    // Assert: the document remains unchanged.
    await expect.poll(async () => {
      const doc = await readOutlineDoc(page)
      return {
        topLevelCount: doc.content?.length ?? 0,
        rootChildCount: doc.content?.[0]?.content?.length ?? 0,
        firstText: doc.content?.[0]?.content?.[0]?.content?.[0]?.content?.[0]?.text,
      }
    }).toEqual({
      topLevelCount: 1,
      rootChildCount: 1,
      firstText: 'Alpha',
    })
  })

  test('rewrites an ordered child to unordered when it is unindented into an unordered context', async ({ page }) => {
    // Arrange: create one ordered child under the top-level item.
    await gotoOutlineFixture(page)

    await focusParagraph(page, 0)
    await page.keyboard.press('Enter')
    await page.keyboard.press('Tab')
    await page.keyboard.type('1. Ordered child')

    // Act: unindent the ordered child back to the top level.
    await focusParagraph(page, 1)
    await page.keyboard.press('Shift+Tab')

    // Assert: the moved list is rewritten to an unordered item at the top level.
    await expect.poll(async () => {
      const doc = await readOutlineDoc(page)
      return {
        topLevelCount: doc.content?.length ?? 0,
        secondListType: doc.content?.[1]?.type,
        secondItemType: doc.content?.[1]?.content?.[0]?.type,
        secondText: doc.content?.[1]?.content?.[0]?.content?.[0]?.content?.[0]?.text,
      }
    }).toEqual({
      topLevelCount: 2,
      secondListType: 'outlineUList',
      secondItemType: 'outlineUordItem',
      secondText: 'Ordered child',
    })
  })
})
