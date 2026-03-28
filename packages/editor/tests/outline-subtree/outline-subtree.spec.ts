import { expect, test } from '@playwright/test'
import {
  focusOutlineSubtreeParagraph,
  gotoOutlineSubtreeFixture,
  readOutlineSubtreeEditorDoc,
  readOutlineSubtreeHostDoc,
} from './outline-subtree-test-utils'

test.describe('outline subtree root support', () => {
  test('matches the subtree root chrome screenshot', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'minimal', 'Visual baseline is only maintained for the minimal project')

    await gotoOutlineSubtreeFixture(page, 'unordered')
    const editor = page.getByTestId('outline-subtree-editor')

    await expect.poll(async () => {
      return editor.locator('.outline-list-node-view').count()
    }).toBe(1)

    await expect(editor).toHaveScreenshot('outline-subtree-root-chrome.png', {
      animations: 'disabled',
      caret: 'hide',
      scale: 'css',
    })
  })

  test('preserves root list chrome and indentation when the subtree root becomes the editor root', async ({ page }) => {
    await gotoOutlineSubtreeFixture(page, 'unordered')
    const editor = page.getByTestId('outline-subtree-editor')

    await expect.poll(async () => {
      return editor.locator('.outline-list-node-view').count()
    }).toBe(1)

    const paragraphOffset = await editor.evaluate((element) => {
      const paragraph = element.querySelector('.ProseMirror p')
      if (!(paragraph instanceof HTMLElement)) {
        throw new TypeError('Expected subtree editor to render a paragraph')
      }

      const editorRect = (element as HTMLElement).getBoundingClientRect()
      const paragraphRect = paragraph.getBoundingClientRect()
      return paragraphRect.left - editorRect.left
    })

    expect(paragraphOffset).toBeGreaterThan(60)
  })

  test('renders an unordered subtree with outlineUList as the editor root', async ({ page }) => {
    await gotoOutlineSubtreeFixture(page, 'unordered')

    await expect.poll(async () => {
      const doc = await readOutlineSubtreeEditorDoc(page)
      return doc.type
    }).toBe('outlineUList')
  })

  test('renders an ordered subtree with outlineOrdList as the editor root', async ({ page }) => {
    await gotoOutlineSubtreeFixture(page, 'ordered')

    await expect.poll(async () => {
      const doc = await readOutlineSubtreeEditorDoc(page)
      return doc.type
    }).toBe('outlineOrdList')
  })

  test('updates the host document when editing the subtree root item text', async ({ page }) => {
    await gotoOutlineSubtreeFixture(page, 'unordered')
    await focusOutlineSubtreeParagraph(page, 0)
    await page.keyboard.type(' child')

    await expect.poll(async () => {
      const editorDoc = await readOutlineSubtreeEditorDoc(page)
      const hostDoc = await readOutlineSubtreeHostDoc(page)
      return {
        editorText: editorDoc.content?.[0]?.content?.[0]?.content?.[0]?.text,
        hostText: hostDoc.content?.[0]?.content?.[1]?.content?.[0]?.content?.[0]?.content?.[0]?.text,
      }
    }).toEqual({
      editorText: 'Beta child',
      hostText: 'Beta child',
    })
  })

  test('keeps the host document unchanged when Backspace is pressed at the subtree root start', async ({ page }) => {
    const pageErrors: string[] = []
    page.on('pageerror', error => pageErrors.push(error.message))

    await gotoOutlineSubtreeFixture(page, 'unordered')
    const before = await readOutlineSubtreeHostDoc(page)
    await focusOutlineSubtreeParagraph(page, 0, 'start')
    await page.keyboard.press('Backspace')

    await expect.poll(async () => {
      const after = await readOutlineSubtreeHostDoc(page)
      return {
        pageErrors,
        hostDoc: after,
      }
    }).toEqual({
      pageErrors: [],
      hostDoc: before,
    })
  })

  test('keeps the host document unchanged when Tab is pressed on the subtree root item', async ({ page }) => {
    const pageErrors: string[] = []
    page.on('pageerror', error => pageErrors.push(error.message))

    await gotoOutlineSubtreeFixture(page, 'unordered')
    const before = await readOutlineSubtreeHostDoc(page)
    await focusOutlineSubtreeParagraph(page, 0)
    await page.keyboard.press('Tab')

    await expect.poll(async () => {
      const after = await readOutlineSubtreeHostDoc(page)
      return {
        pageErrors,
        hostDoc: after,
      }
    }).toEqual({
      pageErrors: [],
      hostDoc: before,
    })
  })

  test('keeps the host document unchanged when Shift+Tab is pressed on the subtree root item', async ({ page }) => {
    const pageErrors: string[] = []
    page.on('pageerror', error => pageErrors.push(error.message))

    await gotoOutlineSubtreeFixture(page, 'unordered')
    const before = await readOutlineSubtreeHostDoc(page)
    await focusOutlineSubtreeParagraph(page, 0)
    await page.keyboard.press('Shift+Tab')

    await expect.poll(async () => {
      const after = await readOutlineSubtreeHostDoc(page)
      return {
        pageErrors,
        hostDoc: after,
      }
    }).toEqual({
      pageErrors: [],
      hostDoc: before,
    })
  })

  test('keeps the host document unchanged when Shift+Tab would move a child outside the subtree root', async ({ page }) => {
    const pageErrors: string[] = []
    page.on('pageerror', error => pageErrors.push(error.message))

    await gotoOutlineSubtreeFixture(page, 'unordered')
    await focusOutlineSubtreeParagraph(page, 0)
    await page.keyboard.press('Enter')
    await page.keyboard.type('Gamma')

    const before = await readOutlineSubtreeHostDoc(page)
    await focusOutlineSubtreeParagraph(page, 1)
    await page.keyboard.press('Shift+Tab')

    await expect.poll(async () => {
      const after = await readOutlineSubtreeHostDoc(page)
      return {
        pageErrors,
        hostDoc: after,
      }
    }).toEqual({
      pageErrors: [],
      hostDoc: before,
    })
  })

  test('creates a child branch from the subtree root item when Enter is pressed', async ({ page }) => {
    await gotoOutlineSubtreeFixture(page, 'unordered')
    await focusOutlineSubtreeParagraph(page, 0)
    await page.keyboard.press('Enter')
    await page.keyboard.type('Gamma')

    await expect.poll(async () => {
      const editorDoc = await readOutlineSubtreeEditorDoc(page)
      return {
        rootType: editorDoc.type,
        childCount: editorDoc.content?.length ?? 0,
        firstChildListType: editorDoc.content?.[1]?.type,
        firstChildText: editorDoc.content?.[1]?.content?.[0]?.content?.[0]?.content?.[0]?.text,
      }
    }).toEqual({
      rootType: 'outlineUList',
      childCount: 2,
      firstChildListType: 'outlineUList',
      firstChildText: 'Gamma',
    })
  })
})
