import { expect, test } from '@playwright/test'
import {
  createNestedChild,
  focusParagraph,
  focusParagraphByText,
  gotoOutlineFixture,
  readOutlineDoc,
} from './outline-test-utils'

test.describe('outline backspace interactions', () => {
  test('removes an empty outline item when Backspace is pressed at the item start', async ({ page }) => {
    // Arrange: create an empty sibling item below the initial item.
    await gotoOutlineFixture(page)

    await focusParagraph(page, 0)
    await page.keyboard.press('Enter')

    // Act: press Backspace at the start of the empty item.
    await page.keyboard.press('Backspace')

    // Assert: the empty item is removed and the original content stays intact.
    await expect.poll(async () => {
      const doc = await readOutlineDoc(page)
      return {
        topLevelCount: doc.content?.length ?? 0,
        firstText: doc.content?.[0]?.content?.[0]?.content?.[0]?.content?.[0]?.text,
      }
    }).toEqual({
      topLevelCount: 1,
      firstText: 'Alpha',
    })
  })

  test('blocks structural deletion when Backspace is pressed at the start of the first top-level item', async ({ page }) => {
    // Arrange: place the caret at the start of the first top-level item.
    await gotoOutlineFixture(page)
    await focusParagraph(page, 0, 'start')

    // Act: press Backspace at the protected position.
    await page.keyboard.press('Backspace')

    // Assert: the first top-level item is preserved.
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

  test('merges a non-empty child into its parent when Backspace is pressed at the child start', async ({ page }) => {
    // Arrange: create one nested child under the initial top-level item.
    await gotoOutlineFixture(page)
    await createNestedChild(page, 'Beta')

    // Act: press Backspace at the start of the child item.
    await focusParagraph(page, 1, 'start')
    await page.keyboard.press('Backspace')

    // Assert: the child content is merged into the parent item and the child list is removed.
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
      firstText: 'AlphaBeta',
    })
  })

  test('merges a non-empty child into its previous sibling child when Backspace is pressed at the child start', async ({ page }) => {
    // Arrange: create two nested children under the top-level item.
    await gotoOutlineFixture(page)
    await createNestedChild(page, 'Beta')

    await focusParagraph(page, 0)
    await page.keyboard.press('Enter')
    await page.keyboard.type('Gamma')

    // Act: press Backspace at the start of the second child.
    await focusParagraph(page, 2, 'start')
    await page.keyboard.press('Backspace')

    // Assert: the second child is merged into the previous child and removed.
    await expect.poll(async () => {
      const doc = await readOutlineDoc(page)
      return {
        topLevelCount: doc.content?.length ?? 0,
        rootChildCount: doc.content?.[0]?.content?.length ?? 0,
        firstText: doc.content?.[0]?.content?.[0]?.content?.[0]?.content?.[0]?.text,
        mergedChildText: doc.content?.[0]?.content?.[1]?.content?.[0]?.content?.[0]?.content?.[0]?.text,
      }
    }).toEqual({
      topLevelCount: 1,
      rootChildCount: 2,
      firstText: 'Alpha',
      mergedChildText: 'GammaBeta',
    })
  })

  test('promotes a deleted empty child nested list to the parent level', async ({ page }) => {
    // Arrange: create an empty child under the top-level item, then nest another child inside it.
    await gotoOutlineFixture(page)

    await focusParagraph(page, 0)
    await page.keyboard.press('Enter')
    await page.keyboard.press('Tab')
    await page.keyboard.press('Enter')
    await page.keyboard.type('Beta')
    await page.keyboard.press('Tab')

    await expect.poll(async () => {
      const doc = await readOutlineDoc(page)
      const rootList = doc.content?.[0]
      const emptyChildList = rootList?.content?.[1]
      const nestedChildList = emptyChildList?.content?.[1]

      return {
        topLevelCount: doc.content?.length ?? 0,
        rootChildCount: rootList?.content?.length ?? 0,
        emptyChildText: emptyChildList?.content?.[0]?.content?.[0]?.content?.[0]?.text ?? '',
        nestedChildText: nestedChildList?.content?.[0]?.content?.[0]?.content?.[0]?.text ?? '',
      }
    }).toEqual({
      topLevelCount: 1,
      rootChildCount: 2,
      emptyChildText: '',
      nestedChildText: 'Beta',
    })

    // Act: delete the empty child item from its start.
    await focusParagraph(page, 1, 'start')
    await page.keyboard.press('Backspace')

    // Assert: the nested child list is promoted to the parent level.
    await expect.poll(async () => {
      const doc = await readOutlineDoc(page)
      return {
        topLevelCount: doc.content?.length ?? 0,
        rootChildCount: doc.content?.[0]?.content?.length ?? 0,
        firstText: doc.content?.[0]?.content?.[0]?.content?.[0]?.content?.[0]?.text,
        promotedChildText: doc.content?.[0]?.content?.[1]?.content?.[0]?.content?.[0]?.content?.[0]?.text,
      }
    }).toEqual({
      topLevelCount: 1,
      rootChildCount: 2,
      firstText: 'Alpha',
      promotedChildText: 'Beta',
    })
  })

  test('converts a unique ordered child back to unordered when Backspace is pressed at its start', async ({ page }) => {
    // Arrange: create one ordered child under the top-level item.
    await gotoOutlineFixture(page)

    await focusParagraph(page, 0)
    await page.keyboard.press('Enter')
    await page.keyboard.press('Tab')
    await page.keyboard.type('1. Ordered child')

    await expect.poll(async () => {
      const doc = await readOutlineDoc(page)
      return doc.content?.[0]?.content?.[1]?.content?.[0]?.type
    }).toBe('outlineOrdItem')

    // Act: press Backspace at the start of the ordered child.
    await focusParagraphByText(page, 'Ordered child', 'start')
    await page.keyboard.press('Backspace')

    // Assert: the ordered layer is converted back to unordered.
    await expect.poll(async () => {
      const doc = await readOutlineDoc(page)
      return {
        rootListType: doc.content?.[0]?.type,
        childListType: doc.content?.[0]?.content?.[1]?.type,
        childItemType: doc.content?.[0]?.content?.[1]?.content?.[0]?.type,
        childText: doc.content?.[0]?.content?.[1]?.content?.[0]?.content?.[0]?.content?.[0]?.text,
      }
    }).toEqual({
      rootListType: 'outlineUList',
      childListType: 'outlineUList',
      childItemType: 'outlineUordItem',
      childText: 'Ordered child',
    })
  })

  test('merges an ordered child into its previous ordered sibling when the ordered layer has multiple child branches', async ({ page }) => {
    // Arrange: create an ordered child and then add a second ordered child branch.
    await gotoOutlineFixture(page)

    await focusParagraph(page, 0)
    await page.keyboard.press('Enter')
    await page.keyboard.press('Tab')
    await page.keyboard.type('1. Ordered child')

    await expect.poll(async () => {
      const doc = await readOutlineDoc(page)
      return doc.content?.[0]?.content?.[1]?.content?.[0]?.type
    }).toBe('outlineOrdItem')

    await focusParagraphByText(page, 'Alpha')
    await page.keyboard.press('Enter')
    await page.keyboard.type('Gamma')

    // Act: press Backspace at the start of one ordered child.
    await focusParagraphByText(page, 'Ordered child', 'start')
    await page.keyboard.press('Backspace')

    // Assert: the ordered layer stays ordered while the current child is structurally merged upward.
    await expect.poll(async () => {
      const doc = await readOutlineDoc(page)
      const childLists = doc.content?.[0]?.content?.slice(1) ?? []
      const childTexts = childLists
        .map(node => node.content?.[0]?.content?.[0]?.content?.[0]?.text ?? '')
        .sort()

      return {
        rootListType: doc.content?.[0]?.type,
        childTexts,
        childItemTypes: childLists.map(node => node.content?.[0]?.type),
        childListCount: childLists.length,
      }
    }).toEqual({
      rootListType: 'outlineOrdList',
      childTexts: ['GammaOrdered child'],
      childItemTypes: ['outlineOrdItem'],
      childListCount: 1,
    })
  })
})
