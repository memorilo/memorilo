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

async function selectTextInParagraph(page: Page, index: number, start: number, end: number) {
  const paragraph = page.locator('[data-testid="outline-editor"] .ProseMirror p').nth(index)
  await expect(paragraph).toBeVisible()
  await paragraph.evaluate((node, range) => {
    const paragraph = node as HTMLParagraphElement
    const editor = paragraph.closest('.ProseMirror')
    if (!(editor instanceof HTMLElement)) {
      throw new Error('Outline editor root not found')
    }

    const textNode = Array.from(paragraph.childNodes).find(child => child.nodeType === Node.TEXT_NODE) as Text | undefined
    if (!textNode) {
      throw new Error('Paragraph text node not found')
    }

    editor.focus()

    const selection = window.getSelection()
    if (!selection) {
      throw new Error('Window selection is unavailable')
    }

    const domRange = document.createRange()
    domRange.setStart(textNode, range.start)
    domRange.setEnd(textNode, range.end)
    selection.removeAllRanges()
    selection.addRange(domRange)
    document.dispatchEvent(new Event('selectionchange'))
  }, { start, end })
}

async function createNestedChild(page: Page, text: string) {
  await focusParagraph(page, 0)
  await page.keyboard.press('Enter')
  await page.keyboard.type(text)
  await page.keyboard.press('Tab')
}

test.describe('outline enter interactions', () => {
  test('inserts a new unordered child when pressing Enter on a top-level item that already has children', async ({ page }) => {
    // Arrange: create one nested unordered child under the top-level item.
    await gotoOutlineFixture(page)

    await focusParagraph(page, 0)
    await page.keyboard.press('Enter')
    await page.keyboard.type('Beta')
    await page.keyboard.press('Tab')

    // Act: press Enter on the top-level item to create another child branch.
    await focusParagraph(page, 0)
    await page.keyboard.press('Enter')

    // Assert: the top-level list keeps two child list branches and both remain unordered.
    await expect.poll(async () => {
      const doc = await readOutlineDoc(page)
      const rootList = doc.content?.[0]
      const childLists = rootList?.content?.slice(1) ?? []

      return {
        topLevelCount: doc.content?.length ?? 0,
        rootListType: rootList?.type,
        rootChildCount: rootList?.content?.length ?? 0,
        childListTypes: childLists.map(node => node.type),
      }
    }).toEqual({
      topLevelCount: 1,
      rootListType: 'outlineUList',
      rootChildCount: 3,
      childListTypes: ['outlineUList', 'outlineUList'],
    })
  })

  test('creates a correctly numbered ordered child when pressing Enter on a top-level item with ordered children', async ({ page }) => {
    // Arrange: create a nested child and turn it into an ordered item through user input.
    await gotoOutlineFixture(page)

    await focusParagraph(page, 0)
    await page.keyboard.press('Enter')
    await page.keyboard.press('Tab')
    await page.keyboard.type('1. Ordered child')

    // Act: press Enter on the top-level item to insert another child before the existing ordered child.
    await focusParagraph(page, 0)
    await page.keyboard.press('Enter')

    // Assert: both children are ordered items and their numbers are recalculated to stay sequential.
    await expect.poll(async () => {
      const doc = await readOutlineDoc(page)
      const rootList = doc.content?.[0]
      const childLists = rootList?.content?.slice(1) ?? []
      const childItems = childLists.map(node => node.content?.[0]).filter(Boolean)
      const childNumbers = childItems
        .map(item => item?.attrs?.number)
        .filter((value): value is number => typeof value === 'number')
        .sort((left, right) => left - right)
      const childTexts = childItems
        .map(item => item?.content?.[0]?.content?.[0]?.text ?? '')
        .sort()

      return {
        topLevelCount: doc.content?.length ?? 0,
        rootListType: rootList?.type,
        rootChildCount: rootList?.content?.length ?? 0,
        childListTypes: childLists.map(node => node.type),
        childItemTypes: childItems.map(item => item?.type),
        childNumbers,
        childTexts,
      }
    }).toEqual({
      topLevelCount: 1,
      rootListType: 'outlineOrdList',
      rootChildCount: 3,
      childListTypes: ['outlineUList', 'outlineUList'],
      childItemTypes: ['outlineOrdItem', 'outlineOrdItem'],
      childNumbers: [1, 2],
      childTexts: ['', 'Ordered child'],
    })
  })

  test('deletes the selected text before splitting an outline item with Enter', async ({ page }) => {
    // Arrange: select the middle characters of the top-level item text.
    await gotoOutlineFixture(page)
    await selectTextInParagraph(page, 0, 2, 4)

    // Act: split the item while the text selection is active.
    await page.keyboard.press('Enter')

    // Assert: the selected text is removed before the item is split.
    await expect.poll(async () => {
      const doc = await readOutlineDoc(page)
      return {
        topLevelCount: doc.content?.length ?? 0,
        firstText: doc.content?.[0]?.content?.[0]?.content?.[0]?.content?.[0]?.text,
        secondText: doc.content?.[1]?.content?.[0]?.content?.[0]?.content?.[0]?.text,
      }
    }).toEqual({
      topLevelCount: 2,
      firstText: 'Al',
      secondText: 'a',
    })
  })

  test('deletes the selected text before splitting into a new unordered child when the item already has unordered children', async ({ page }) => {
    // Arrange: create one unordered child, then select text inside the parent item.
    await gotoOutlineFixture(page)
    await createNestedChild(page, 'Beta')
    await selectTextInParagraph(page, 0, 2, 4)

    // Act: split the parent item while the text selection is active.
    await page.keyboard.press('Enter')

    // Assert: the selected text is removed first, then the trailing content becomes a new unordered child branch.
    await expect.poll(async () => {
      const doc = await readOutlineDoc(page)
      const rootList = doc.content?.[0]
      const childLists = rootList?.content?.slice(1) ?? []
      const childTexts = childLists.map(node => node.content?.[0]?.content?.[0]?.content?.[0]?.text ?? '')

      return {
        topLevelCount: doc.content?.length ?? 0,
        rootListType: rootList?.type,
        rootChildCount: rootList?.content?.length ?? 0,
        firstText: rootList?.content?.[0]?.content?.[0]?.content?.[0]?.text,
        childListTypes: childLists.map(node => node.type),
        childItemTypes: childLists.map(node => node.content?.[0]?.type),
        childTexts,
      }
    }).toEqual({
      topLevelCount: 1,
      rootListType: 'outlineUList',
      rootChildCount: 3,
      firstText: 'Al',
      childListTypes: ['outlineUList', 'outlineUList'],
      childItemTypes: ['outlineUordItem', 'outlineUordItem'],
      childTexts: ['a', 'Beta'],
    })
  })

  test('deletes the selected text before splitting into a new ordered child when the item already has ordered children', async ({ page }) => {
    // Arrange: create one ordered child, then select text inside the parent item.
    await gotoOutlineFixture(page)

    await focusParagraph(page, 0)
    await page.keyboard.press('Enter')
    await page.keyboard.press('Tab')
    await page.keyboard.type('1. Ordered child')

    await selectTextInParagraph(page, 0, 2, 4)

    // Act: split the parent item while the text selection is active.
    await page.keyboard.press('Enter')

    // Assert: the selected text is removed first, then the trailing content becomes a new ordered child with renumbered siblings.
    await expect.poll(async () => {
      const doc = await readOutlineDoc(page)
      const rootList = doc.content?.[0]
      const childLists = rootList?.content?.slice(1) ?? []
      const childItems = childLists.map(node => node.content?.[0]).filter(Boolean)
      const childTexts = childItems.map(item => item?.content?.[0]?.content?.[0]?.text ?? '')
      const childNumbers = childItems
        .map(item => item?.attrs?.number)
        .filter((value): value is number => typeof value === 'number')

      return {
        topLevelCount: doc.content?.length ?? 0,
        rootListType: rootList?.type,
        rootChildCount: rootList?.content?.length ?? 0,
        firstText: rootList?.content?.[0]?.content?.[0]?.content?.[0]?.text,
        childListTypes: childLists.map(node => node.type),
        childItemTypes: childItems.map(item => item?.type),
        childTexts,
        childNumbers,
      }
    }).toEqual({
      topLevelCount: 1,
      rootListType: 'outlineOrdList',
      rootChildCount: 3,
      firstText: 'Al',
      childListTypes: ['outlineUList', 'outlineUList'],
      childItemTypes: ['outlineOrdItem', 'outlineOrdItem'],
      childTexts: ['a', 'Ordered child'],
      childNumbers: [1, 2],
    })
  })
})
