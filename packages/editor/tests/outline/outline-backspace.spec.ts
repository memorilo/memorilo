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
  await focusParagraphLocator(paragraph, edge)
}

async function focusParagraphLocator(paragraph: ReturnType<Page['locator']>, edge: 'start' | 'end' = 'end') {
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

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

async function focusParagraphByText(page: Page, text: string, edge: 'start' | 'end' = 'end') {
  const paragraph = page
    .locator('[data-testid="outline-editor"] .ProseMirror p')
    .filter({ hasText: new RegExp(`^${escapeRegExp(text)}$`) })
    .first()
  await focusParagraphLocator(paragraph, edge)
}

async function clickParagraphByText(page: Page, text: string) {
  const paragraph = page
    .locator('[data-testid="outline-editor"] .ProseMirror p')
    .filter({ hasText: new RegExp(`^${escapeRegExp(text)}$`) })
    .first()
  await expect(paragraph).toBeVisible()
  await paragraph.click()
}

async function focusEmptyParagraph(page: Page, occurrence = 0, edge: 'start' | 'end' = 'start') {
  const paragraphs = page.locator('[data-testid="outline-editor"] .ProseMirror p')
  const targetIndex = await paragraphs.evaluateAll((nodes, index) => {
    const emptyIndexes = nodes.flatMap((node, currentIndex) => {
      const text = node.textContent?.trim() ?? ''
      return text.length === 0 ? [currentIndex] : []
    })
    return emptyIndexes[index] ?? -1
  }, occurrence)

  if (targetIndex < 0) {
    throw new Error('Empty paragraph not found')
  }

  await focusParagraph(page, targetIndex, edge)
}

async function pressLineEnd(page: Page) {
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+ArrowRight' : 'End')
}

async function createNestedChild(page: Page, text: string) {
  await focusParagraph(page, 0)
  await page.keyboard.press('Enter')
  await page.keyboard.type(text)
  await page.keyboard.press('Tab')
}

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

  test('promotes a deleted child nested lists to the parent level', async ({ page }) => {
    // Arrange: create an empty child item that itself has a nested child.
    await gotoOutlineFixture(page)
    await createNestedChild(page, 'Beta')

    await clickParagraphByText(page, 'Beta')
    await pressLineEnd(page)
    await page.keyboard.press('Enter')
    await page.keyboard.type('Gamma')
    await page.keyboard.press('Tab')

    // Act: delete the empty parent child item from its start.
    await focusEmptyParagraph(page)
    await page.keyboard.press('Backspace')

    // Assert: the deleted child nested list is promoted to the parent level.
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
      promotedChildText: 'GammaBeta',
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
