import type { Page } from '@playwright/test'
import type { JsonNode } from '../editor-test-utils'
import { focusParagraph as focusFixtureParagraph, readFixtureDoc } from '../editor-test-utils'

export async function gotoOutlineSubtreeFixture(
  page: Page,
  variant: 'unordered' | 'ordered' = 'unordered',
) {
  await page.goto(`outline-subtree/?root=${variant}`)
}

export async function readOutlineSubtreeEditorDoc(page: Page): Promise<JsonNode> {
  return readFixtureDoc(page, 'outline-subtree-editor-json')
}

export async function readOutlineSubtreeHostDoc(page: Page): Promise<JsonNode> {
  return readFixtureDoc(page, 'outline-subtree-host-json')
}

export async function focusOutlineSubtreeParagraph(
  page: Page,
  index: number,
  edge: 'start' | 'end' = 'end',
) {
  await focusFixtureParagraph(page, 'outline-subtree-editor', index, edge)
}
