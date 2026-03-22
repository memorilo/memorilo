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

async function createNestedChild(page: Page, text: string) {
  await focusParagraph(page, 0)
  await page.keyboard.press('Enter')
  await page.keyboard.type(text)
  await page.keyboard.press('Tab')
}

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
    await focusEmptyParagraph(page)
    await page.keyboard.type('Gamma')

    // Act: type an ordered-list marker in one of the child items.
    await page.keyboard.press('Home')
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
