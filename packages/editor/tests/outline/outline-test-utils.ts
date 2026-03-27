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
