import type { Page } from '@playwright/test'
import type { JSONContent } from '@tiptap/core'
import type { JsonNode } from '../editor-test-utils'
import process from 'node:process'
import { expect } from '@playwright/test'
import {
  focusParagraph as focusFixtureParagraph,
  readFixtureDoc,
  selectTextInParagraph as selectFixtureTextInParagraph,
} from '../editor-test-utils'
import { bootstrapFullMathFixture } from '../full-environment-test-utils'

export { getNodeText } from '../editor-test-utils'
export type { JsonNode } from '../editor-test-utils'

export interface SelectionInfo {
  from: number
  to: number
  empty: boolean
  parentType: string
  parentOffset: number
  ancestorTypes: string[]
  blockType: string | null
  blockText: string
}

export interface DomSelectionInfo {
  hasSelection: boolean
  rangeCount: number
  isCollapsed: boolean
  activeElementInsideEditor: boolean
  anchorInsideEditor: boolean
  focusInsideEditor: boolean
  anchorInsideInlineMath: boolean
  focusInsideInlineMath: boolean
  anchorInsideNodeViewContent: boolean
  focusInsideNodeViewContent: boolean
}

export async function gotoMathFixture(page: Page) {
  await page.goto('math/')
  await page.waitForSelector('[data-testid="math-editor"] .ProseMirror p', { state: 'visible' })
  await bootstrapFullMathFixture(page)
  await expect.poll(async () => {
    const doc = await readMathDoc(page)
    return doc.content?.length ?? 0
  }).toBe(3)
}

export async function readMathDoc(page: Page): Promise<JsonNode> {
  return readFixtureDoc(page, 'math-json')
}

export async function readMathSelection(page: Page): Promise<SelectionInfo> {
  const selection = await page.evaluate(() => {
    return window.__mathFixture?.getSelection() ?? null
  })

  if (!selection) {
    throw new Error('Math fixture selection helpers are unavailable')
  }

  return selection
}

export async function readMathDomSelection(page: Page): Promise<DomSelectionInfo> {
  return await page.evaluate(() => {
    const editor = document.querySelector('[data-testid="math-editor"] .ProseMirror')
    const domSelection = document.getSelection()

    const isInside = (container: Element | null, node: Node | null) => {
      if (!container || !node) {
        return false
      }

      return container === node || container.contains(node)
    }

    const closest = (node: Node | null, selector: string) => {
      if (!node) {
        return null
      }

      const element = node instanceof Element ? node : node.parentElement
      return element?.closest(selector) ?? null
    }

    const activeElement = document.activeElement

    return {
      hasSelection: !!domSelection,
      rangeCount: domSelection?.rangeCount ?? 0,
      isCollapsed: domSelection?.isCollapsed ?? false,
      activeElementInsideEditor: editor instanceof HTMLElement && activeElement instanceof Node
        ? activeElement === editor || editor.contains(activeElement)
        : false,
      anchorInsideEditor: editor instanceof Element
        ? isInside(editor, domSelection?.anchorNode ?? null)
        : false,
      focusInsideEditor: editor instanceof Element
        ? isInside(editor, domSelection?.focusNode ?? null)
        : false,
      anchorInsideInlineMath: !!closest(domSelection?.anchorNode ?? null, '[data-type="inline-math"]'),
      focusInsideInlineMath: !!closest(domSelection?.focusNode ?? null, '[data-type="inline-math"]'),
      anchorInsideNodeViewContent: !!closest(domSelection?.anchorNode ?? null, '[data-node-view-content]'),
      focusInsideNodeViewContent: !!closest(domSelection?.focusNode ?? null, '[data-node-view-content]'),
    }
  })
}

export async function flushSelectionSync(page: Page) {
  await page.evaluate(async () => {
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
  })
}

export async function setMathFixtureContent(page: Page, content: JSONContent) {
  await page.evaluate((nextContent) => {
    if (!window.__mathFixture) {
      throw new Error('Math fixture helpers are unavailable')
    }

    window.__mathFixture.setContent(nextContent)
  }, content)

  await expect.poll(async () => {
    const doc = await readMathDoc(page)
    return doc.content?.length ?? 0
  }).toBe(content.content?.length ?? 0)
}

export async function focusParagraph(page: Page, index: number, edge: 'start' | 'end' = 'end') {
  await focusFixtureParagraph(page, 'math-editor', index, edge)
}

export async function selectTextInParagraph(page: Page, index: number, start: number, end: number) {
  await selectFixtureTextInParagraph(page, 'math-editor', index, start, end)
}

export async function focusLastParagraph(page: Page, edge: 'start' | 'end' = 'end') {
  const selector = '[data-testid="math-editor"] .ProseMirror p'
  await page.waitForSelector(selector, { state: 'visible' })
  const count = await page.evaluate((paragraphSelector) => {
    return document.querySelectorAll(paragraphSelector).length
  }, selector)

  if (count === 0) {
    throw new Error('No paragraphs found in math fixture')
  }

  await focusParagraph(page, count - 1, edge)
}

export async function clickInlineMath(page: Page, index: number) {
  const selector = '[data-testid="math-editor"] [data-type="inline-math"]'
  await page.waitForFunction(({ inlineMathSelector, inlineMathIndex }) => {
    const inlineMath = document.querySelectorAll(inlineMathSelector).item(inlineMathIndex)
    return inlineMath instanceof HTMLElement && inlineMath.getClientRects().length > 0
  }, { inlineMathSelector: selector, inlineMathIndex: index })

  await page.evaluate(({ inlineMathSelector, inlineMathIndex }) => {
    const inlineMath = document.querySelectorAll(inlineMathSelector).item(inlineMathIndex)
    if (!(inlineMath instanceof HTMLElement)) {
      throw new TypeError(`Inline math node ${inlineMathIndex} not found`)
    }

    inlineMath.scrollIntoView({ block: 'center', inline: 'center' })
  }, { inlineMathSelector: selector, inlineMathIndex: index })

  const clickTarget = await page.evaluate(({ inlineMathSelector, inlineMathIndex }) => {
    const inlineMath = document.querySelectorAll(inlineMathSelector).item(inlineMathIndex)
    if (!(inlineMath instanceof HTMLElement)) {
      throw new TypeError(`Inline math node ${inlineMathIndex} not found`)
    }

    const rect = inlineMath.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0) {
      throw new Error(`Inline math node ${inlineMathIndex} is not visible`)
    }

    return {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    }
  }, { inlineMathSelector: selector, inlineMathIndex: index })

  await page.mouse.click(clickTarget.x, clickTarget.y)
}

export async function pressInlineMathShortcut(page: Page) {
  const modifier = process.platform === 'darwin' ? 'Meta' : 'Control'
  await page.keyboard.press(`${modifier}+Shift+KeyM`)
}

export async function pressBlockMathShortcut(page: Page) {
  const modifier = process.platform === 'darwin' ? 'Meta' : 'Control'
  await page.keyboard.press(`${modifier}+Alt+KeyM`)
}

export async function pressSelectAllShortcut(page: Page) {
  const modifier = process.platform === 'darwin' ? 'Meta' : 'Control'
  await page.keyboard.press(`${modifier}+KeyA`)
}

export function countNodesByType(node: JsonNode | undefined, targetType: string): number {
  if (!node) {
    return 0
  }

  const selfCount = node.type === targetType ? 1 : 0
  return selfCount + (node.content ?? []).reduce((count, child) => count + countNodesByType(child, targetType), 0)
}

export function getTopLevelOutlineItem(doc: JsonNode, index: number): JsonNode | undefined {
  return doc.content?.[index]?.content?.[0]
}

export function getTopLevelBlocks(doc: JsonNode, index: number): JsonNode[] {
  return getTopLevelOutlineItem(doc, index)?.content ?? []
}
