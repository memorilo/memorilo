import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'

interface JsonNode {
  type: string
  attrs?: Record<string, unknown>
  content?: JsonNode[]
  text?: string
}

async function gotoOutlineFixture(page: Page) {
  await page.goto('/outline/')
  await expect(page.getByTestId('outline-editor').locator('.ProseMirror')).toBeVisible()
}

async function readOutlineDoc(page: Page): Promise<JsonNode> {
  const text = await page.getByTestId('outline-json').innerText()
  return JSON.parse(text) as JsonNode
}

async function focusParagraph(page: Page, index: number, edge: 'start' | 'end' = 'end') {
  const paragraph = page.locator('[data-testid="outline-editor"] .ProseMirror p').nth(index)
  await expect(paragraph).toBeVisible()
  await paragraph.evaluate((node, targetEdge) => {
    const paragraph = node as HTMLParagraphElement
    const editor = paragraph.closest('.ProseMirror')
    if (!(editor instanceof HTMLElement)) {
      throw new Error('Outline editor root not found')
    }

    editor.focus()

    const selection = window.getSelection()
    if (!selection) {
      throw new Error('Window selection is unavailable')
    }

    const range = document.createRange()
    const walker = document.createTreeWalker(paragraph, NodeFilter.SHOW_TEXT)

    let firstTextNode: Text | null = null
    let lastTextNode: Text | null = null
    while (walker.nextNode()) {
      const textNode = walker.currentNode as Text
      if (!firstTextNode) {
        firstTextNode = textNode
      }
      lastTextNode = textNode
    }

    if (targetEdge === 'start') {
      if (firstTextNode) {
        range.setStart(firstTextNode, 0)
      }
      else {
        range.setStart(paragraph, 0)
      }
    }
    else if (lastTextNode) {
      range.setStart(lastTextNode, lastTextNode.textContent?.length ?? 0)
    }
    else {
      range.setStart(paragraph, paragraph.childNodes.length)
    }

    range.collapse(true)
    selection.removeAllRanges()
    selection.addRange(range)
    document.dispatchEvent(new Event('selectionchange'))
  }, edge)
}

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
