import type { Page } from '@playwright/test'
import type { JsonNode } from '../editor-test-utils'
import {
  focusParagraph as focusFixtureParagraph,
  readFixtureDoc,
} from '../editor-test-utils'

export { getNodeText } from '../editor-test-utils'
export type { JsonNode } from '../editor-test-utils'

export async function gotoEmojiFixture(page: Page) {
  await page.goto('emoji/')
  await page.waitForSelector('[data-testid="emoji-editor"] .ProseMirror p', { state: 'visible' })
}

export async function readEmojiDoc(page: Page): Promise<JsonNode> {
  return readFixtureDoc(page, 'emoji-json')
}

export async function focusEmojiParagraph(
  page: Page,
  index: number,
  edge: 'start' | 'end' = 'end',
) {
  await focusFixtureParagraph(page, 'emoji-editor', index, edge)
}

export function getTopLevelOutlineItem(doc: JsonNode, index: number): JsonNode | undefined {
  return doc.content?.[index]?.content?.[0]
}

export function getTopLevelBlocks(doc: JsonNode, index: number): JsonNode[] {
  return getTopLevelOutlineItem(doc, index)?.content ?? []
}
