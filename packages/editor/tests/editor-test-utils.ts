import type { Page } from '@playwright/test'

export interface JsonNode {
  type: string
  attrs?: Record<string, unknown>
  content?: JsonNode[]
  text?: string
}

export function isFullEditorFixture(page: Page) {
  return page.url().includes('/full-editor/')
}

export async function readFixtureDoc(page: Page, jsonTestId: string): Promise<JsonNode> {
  const selector = `[data-testid="${jsonTestId}"]`
  await page.waitForSelector(selector)
  const text = await page.textContent(selector)
  if (text === null) {
    throw new Error(`Fixture JSON not found for ${jsonTestId}`)
  }

  return JSON.parse(text) as JsonNode
}

export function getNodeText(node: JsonNode | undefined): string {
  if (!node) {
    return ''
  }

  if (typeof node.text === 'string') {
    return node.text
  }

  return (node.content ?? []).map(child => getNodeText(child)).join('')
}

export async function focusParagraph(
  page: Page,
  editorTestId: string,
  index: number,
  edge: 'start' | 'end' = 'end',
) {
  const selector = getParagraphSelector(editorTestId)
  await waitForParagraph(page, selector, index)
  await page.evaluate(({ paragraphSelector, paragraphIndex, targetEdge }) => {
    const paragraph = document.querySelectorAll(paragraphSelector).item(paragraphIndex)
    if (!(paragraph instanceof HTMLParagraphElement)) {
      throw new Error(`Paragraph ${paragraphIndex} not found for selector ${paragraphSelector}`)
    }

    const editor = paragraph.closest('.ProseMirror')
    if (!(editor instanceof HTMLElement)) {
      throw new Error('Editor root not found')
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
  }, { paragraphSelector: selector, paragraphIndex: index, targetEdge: edge })
}

export async function selectTextInParagraph(
  page: Page,
  editorTestId: string,
  index: number,
  start: number,
  end: number,
) {
  const selector = getParagraphSelector(editorTestId)
  await waitForParagraph(page, selector, index)
  await page.evaluate(({ paragraphSelector, paragraphIndex, range }) => {
    const paragraph = document.querySelectorAll(paragraphSelector).item(paragraphIndex)
    if (!(paragraph instanceof HTMLParagraphElement)) {
      throw new Error(`Paragraph ${paragraphIndex} not found for selector ${paragraphSelector}`)
    }

    const editor = paragraph.closest('.ProseMirror')
    if (!(editor instanceof HTMLElement)) {
      throw new Error('Editor root not found')
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
  }, { paragraphSelector: selector, paragraphIndex: index, range: { start, end } })
}

export async function findParagraphIndexByText(page: Page, editorTestId: string, text: string) {
  const selector = getParagraphSelector(editorTestId)

  await page.waitForFunction(({ paragraphSelector, paragraphText }) => {
    const normalizeWhitespace = (value: string) => value.replace(/\s+/g, ' ').trim()

    return Array.from(document.querySelectorAll(paragraphSelector)).some((node) => {
      return normalizeWhitespace(node.textContent ?? '') === normalizeWhitespace(paragraphText)
    })
  }, { paragraphSelector: selector, paragraphText: text })

  const index = await page.evaluate(({ paragraphSelector, paragraphText }) => {
    const normalizeWhitespace = (value: string) => value.replace(/\s+/g, ' ').trim()

    return Array.from(document.querySelectorAll(paragraphSelector)).findIndex((node) => {
      return normalizeWhitespace(node.textContent ?? '') === normalizeWhitespace(paragraphText)
    })
  }, { paragraphSelector: selector, paragraphText: text })

  if (index < 0) {
    throw new Error(`Paragraph "${text}" not found in ${editorTestId}`)
  }

  return index
}

function getParagraphSelector(editorTestId: string) {
  return `[data-testid="${editorTestId}"] .ProseMirror p`
}

async function waitForParagraph(page: Page, selector: string, index: number) {
  await page.waitForFunction(({ paragraphSelector, paragraphIndex }) => {
    const paragraph = document.querySelectorAll(paragraphSelector).item(paragraphIndex)
    return paragraph instanceof HTMLParagraphElement && paragraph.getClientRects().length > 0
  }, { paragraphSelector: selector, paragraphIndex: index })
}
