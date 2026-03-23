import type { Page } from '@playwright/test'
import { expect } from '@playwright/test'
import {
  focusParagraph,
  getNodeText,
  isFullEditorFixture,
  readFixtureDoc,
} from './editor-test-utils'

export async function bootstrapFullMathFixture(page: Page) {
  if (!isFullEditorFixture(page)) {
    return
  }

  const currentDoc = await readFixtureDoc(page, 'math-json')
  const currentTexts = (currentDoc.content ?? []).map((node) => getNodeText(node.content?.[0]))
  if (currentTexts.length === 3 && currentTexts[0] === '' && currentTexts[1] === 'Alpha' && currentTexts[2] === 'Beta') {
    return
  }

  await focusParagraph(page, 'math-editor', 0)
  await page.keyboard.press('Enter')
  await page.keyboard.type('Alpha')
  await page.keyboard.press('Enter')
  await page.keyboard.type('Beta')

  await expect.poll(async () => {
    const doc = await readFixtureDoc(page, 'math-json')
    return (doc.content ?? []).map((node) => getNodeText(node.content?.[0]))
  }).toEqual(['', 'Alpha', 'Beta'])
}

export async function bootstrapFullOutlineFixture(page: Page) {
  if (!isFullEditorFixture(page)) {
    return
  }

  const currentDoc = await readFixtureDoc(page, 'outline-json')
  const currentText = getNodeText(currentDoc.content?.[0]?.content?.[0])
  if ((currentDoc.content?.length ?? 0) === 1 && currentText === 'Alpha') {
    return
  }

  await focusParagraph(page, 'outline-editor', 0)
  await page.keyboard.type('Alpha')

  await expect.poll(async () => {
    const doc = await readFixtureDoc(page, 'outline-json')
    return {
      topLevelCount: doc.content?.length ?? 0,
      firstText: getNodeText(doc.content?.[0]?.content?.[0]),
    }
  }).toEqual({
    topLevelCount: 1,
    firstText: 'Alpha',
  })
}
