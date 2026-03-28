import type { Page } from '@playwright/test'
import type { JsonNode } from '../editor-test-utils'
import { expect } from '@playwright/test'
import {
  findParagraphIndexByText,
  focusParagraph as focusFixtureParagraph,
  readFixtureDoc,
  selectTextInParagraph as selectFixtureTextInParagraph,
} from '../editor-test-utils'
import { bootstrapFullOutlineFixture } from '../full-environment-test-utils'

export type { JsonNode } from '../editor-test-utils'

export interface OutlineMarkerAlignment {
  markerCenterY: number
  markerHeight: number
  paragraphCenterY: number
  paragraphHeight: number
  deltaY: number
}

export async function gotoOutlineFixture(page: Page) {
  await page.goto('outline/')
  await page.waitForSelector('[data-testid="outline-editor"] .ProseMirror p', { state: 'visible' })
  await bootstrapFullOutlineFixture(page)
  await expect.poll(async () => {
    const doc = await readOutlineDoc(page)
    return doc.content?.length ?? 0
  }).toBe(1)
}

export async function readOutlineDoc(page: Page): Promise<JsonNode> {
  return readFixtureDoc(page, 'outline-json')
}

export async function focusParagraph(page: Page, index: number, edge: 'start' | 'end' = 'end') {
  await focusFixtureParagraph(page, 'outline-editor', index, edge)
}

export async function focusParagraphByText(page: Page, text: string, edge: 'start' | 'end' = 'end') {
  const index = await findParagraphIndexByText(page, 'outline-editor', text)
  await focusFixtureParagraph(page, 'outline-editor', index, edge)
}

export async function selectTextInParagraph(page: Page, index: number, start: number, end: number) {
  await selectFixtureTextInParagraph(page, 'outline-editor', index, start, end)
}

export async function createNestedChild(page: Page, text: string) {
  await focusParagraph(page, 0)
  await page.keyboard.press('Enter')
  await page.keyboard.type(text)
  await page.keyboard.press('Tab')
}

export async function readOutlineItemMarkerAlignment(
  page: Page,
  index: number,
): Promise<OutlineMarkerAlignment> {
  const selector = '[data-testid="outline-editor"] .ProseMirror p'

  await page.waitForFunction(({ paragraphSelector, paragraphIndex }) => {
    const findItemWrapper = (element: Element | null) => {
      let current = element?.parentElement ?? null
      while (current) {
        if (
          current.hasAttribute('data-node-view-wrapper')
          && Array.from(current.children).some((child) => {
            return child instanceof HTMLElement
              && child.getAttribute('contenteditable') === 'false'
              && child.getClientRects().length > 0
          })
        ) {
          return current
        }

        current = current.parentElement
      }

      return null
    }

    const paragraph = document.querySelectorAll(paragraphSelector).item(paragraphIndex)
    if (!(paragraph instanceof HTMLParagraphElement)) {
      return false
    }

    const itemWrapper = findItemWrapper(paragraph)
    if (!itemWrapper) {
      return false
    }
    return true
  }, { paragraphSelector: selector, paragraphIndex: index })

  return page.evaluate(({ paragraphSelector, paragraphIndex }) => {
    const findItemWrapper = (element: Element | null) => {
      let current = element?.parentElement ?? null
      while (current) {
        if (
          current.hasAttribute('data-node-view-wrapper')
          && Array.from(current.children).some((child) => {
            return child instanceof HTMLElement
              && child.getAttribute('contenteditable') === 'false'
          })
        ) {
          return current
        }

        current = current.parentElement
      }

      return null
    }

    const paragraph = document.querySelectorAll(paragraphSelector).item(paragraphIndex)
    if (!(paragraph instanceof HTMLParagraphElement)) {
      throw new TypeError(`Paragraph ${paragraphIndex} not found for selector ${paragraphSelector}`)
    }

    const itemWrapper = findItemWrapper(paragraph)
    if (!itemWrapper) {
      throw new TypeError(`Outline item wrapper not found for paragraph ${paragraphIndex}`)
    }

    const marker = Array.from(itemWrapper.children).find((child) => {
      return child instanceof HTMLElement
        && child.getAttribute('contenteditable') === 'false'
    })
    if (!(marker instanceof HTMLElement)) {
      throw new TypeError(`Outline marker not found for paragraph ${paragraphIndex}`)
    }

    const paragraphRect = paragraph.getBoundingClientRect()
    const markerRect = marker.getBoundingClientRect()
    const paragraphCenterY = paragraphRect.top + paragraphRect.height / 2
    const markerCenterY = markerRect.top + markerRect.height / 2

    return {
      markerCenterY,
      markerHeight: markerRect.height,
      paragraphCenterY,
      paragraphHeight: paragraphRect.height,
      deltaY: markerCenterY - paragraphCenterY,
    }
  }, { paragraphSelector: selector, paragraphIndex: index })
}
