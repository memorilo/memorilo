import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'
import {
  focusParagraph,
  gotoOutlineFixture,
  readOutlineDoc,
} from './outline-test-utils'

const modifier = process.platform === 'darwin' ? 'Meta' : 'Control'

async function pressModEnter(page: Page) {
  await page.keyboard.press(`${modifier}+Enter`)
}

test.describe('outline task interactions', () => {
  test('toggles the initial item into a task and appends a new top-level unordered item', async ({ page }) => {
    // Arrange: open the minimal outline fixture with a single top-level item.
    await gotoOutlineFixture(page)

    // Act: convert the current item into a task item, then create and fill a new top-level sibling.
    await focusParagraph(page, 0)
    await pressModEnter(page)

    await focusParagraph(page, 0)
    await page.keyboard.press('End')
    await page.keyboard.press('Enter')
    await page.keyboard.type('Beta')

    // Assert: the first item becomes a task item and the new sibling remains unordered.
    await expect.poll(async () => {
      const doc = await readOutlineDoc(page)
      const firstItem = doc.content?.[0]?.content?.[0]
      const secondList = doc.content?.[1]
      const secondItem = secondList?.content?.[0]

      return {
        firstType: firstItem?.type,
        firstStatus: firstItem?.attrs?.status,
        topLevelCount: doc.content?.length ?? 0,
        secondListType: secondList?.type,
        secondItemType: secondItem?.type,
        secondText: secondItem?.content?.[0]?.content?.[0]?.text,
      }
    }).toEqual({
      firstType: 'outlineTaskItem',
      firstStatus: 'todo',
      topLevelCount: 2,
      secondListType: 'outlineUList',
      secondItemType: 'outlineUordItem',
      secondText: 'Beta',
    })
  })

  test('cycles an item through todo states and exits todo mode with repeated Mod+Enter', async ({ page }) => {
    // Arrange: focus the initial top-level item.
    await gotoOutlineFixture(page)
    await focusParagraph(page, 0)

    // Act and assert: cycle through each todo state, then exit back to unordered.
    await pressModEnter(page)
    await expect.poll(async () => {
      const doc = await readOutlineDoc(page)
      const firstItem = doc.content?.[0]?.content?.[0]
      return {
        firstType: firstItem?.type,
        firstStatus: firstItem?.attrs?.status,
      }
    }).toEqual({
      firstType: 'outlineTaskItem',
      firstStatus: 'todo',
    })

    await pressModEnter(page)
    await expect.poll(async () => {
      const doc = await readOutlineDoc(page)
      const firstItem = doc.content?.[0]?.content?.[0]
      return {
        firstType: firstItem?.type,
        firstStatus: firstItem?.attrs?.status,
      }
    }).toEqual({
      firstType: 'outlineTaskItem',
      firstStatus: 'doing',
    })

    await pressModEnter(page)
    await expect.poll(async () => {
      const doc = await readOutlineDoc(page)
      const firstItem = doc.content?.[0]?.content?.[0]
      return {
        firstType: firstItem?.type,
        firstStatus: firstItem?.attrs?.status,
      }
    }).toEqual({
      firstType: 'outlineTaskItem',
      firstStatus: 'done',
    })

    await pressModEnter(page)
    await expect.poll(async () => {
      const doc = await readOutlineDoc(page)
      const firstItem = doc.content?.[0]?.content?.[0]
      return {
        firstType: firstItem?.type,
        firstStatus: firstItem?.attrs?.status,
      }
    }).toEqual({
      firstType: 'outlineTaskItem',
      firstStatus: 'discard',
    })

    await pressModEnter(page)
    await expect.poll(async () => {
      const doc = await readOutlineDoc(page)
      const firstItem = doc.content?.[0]?.content?.[0]
      return {
        firstType: firstItem?.type,
        firstText: firstItem?.content?.[0]?.content?.[0]?.text,
      }
    }).toEqual({
      firstType: 'outlineUordItem',
      firstText: 'Alpha',
    })
  })

  test('keeps an ordered item ordered when Mod+Enter is pressed', async ({ page }) => {
    // Arrange: create one ordered child item under the top-level item.
    await gotoOutlineFixture(page)

    await focusParagraph(page, 0)
    await page.keyboard.press('Enter')
    await page.keyboard.press('Tab')
    await page.keyboard.type('1. Ordered child')

    await expect.poll(async () => {
      const doc = await readOutlineDoc(page)
      return doc.content?.[0]?.content?.[1]?.content?.[0]?.type
    }).toBe('outlineOrdItem')

    // Act: press Mod+Enter on the ordered item.
    await pressModEnter(page)

    // Assert: the ordered child is normalized back to an ordered item.
    await expect.poll(async () => {
      const doc = await readOutlineDoc(page)
      const childItem = doc.content?.[0]?.content?.[1]?.content?.[0]
      return {
        rootListType: doc.content?.[0]?.type,
        childItemType: childItem?.type,
        childStatus: childItem?.attrs?.status,
        childText: childItem?.content?.[0]?.content?.[0]?.text,
      }
    }).toEqual({
      rootListType: 'outlineOrdList',
      childItemType: 'outlineOrdItem',
      childStatus: undefined,
      childText: 'Ordered child',
    })
  })
})
