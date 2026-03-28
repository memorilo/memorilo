import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'

interface OutlineVisualSummary {
  listChromeCount: number
  rootLineTop: number | null
  items: Array<{
    markerLeft: number
    markerTop: number
    text: string
    textLeft: number
    textTop: number
  }>
}

async function captureOutlineVisualSummary(page: Page): Promise<OutlineVisualSummary> {
  const editor = page.getByTestId('outline-focus-editor')
  return editor.evaluate((element) => {
    const editorElement = element as HTMLElement
    const editorRect = editorElement.getBoundingClientRect()
    const rootLine = editorElement.querySelector('.outline-list-node-view > span')
    const items = Array
      .from(editorElement.querySelectorAll<HTMLButtonElement>('.outline-marker-button'))
      .map((button) => {
        const markerRect = button.getBoundingClientRect()
        const itemWrapper = button.parentElement
        const textElement = itemWrapper?.querySelector('p, h1, h2, h3, h4, h5, h6')
        if (!(textElement instanceof HTMLElement)) {
          throw new TypeError('Expected outline item to render a visible text block')
        }

        const textRect = textElement.getBoundingClientRect()
        return {
          text: textElement.textContent?.trim() ?? '',
          markerLeft: Math.round(markerRect.left - editorRect.left),
          markerTop: Math.round(markerRect.top - editorRect.top),
          textLeft: Math.round(textRect.left - editorRect.left),
          textTop: Math.round(textRect.top - editorRect.top),
        }
      })

    return {
      listChromeCount: editorElement.querySelectorAll('.outline-list-node-view').length,
      rootLineTop: rootLine instanceof HTMLElement
        ? Math.round(rootLine.getBoundingClientRect().top - editorRect.top)
        : null,
      items,
    }
  })
}

test.describe('outline focus compare', () => {
  test('keeps the branch visually identical after clicking the root marker to focus it', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'minimal', 'Visual comparison baseline is only maintained for the minimal project')

    const pageErrors: string[] = []
    page.on('pageerror', error => pageErrors.push(error.message))

    await page.goto('outline-focus-compare/')
    const editor = page.getByTestId('outline-focus-editor')
    const focusState = page.getByTestId('outline-focus-state')
    const contentErrors = page.getByTestId('outline-content-errors')
    const rootMarker = page.getByRole('button', { name: 'Open outline item' }).first()

    await expect(focusState).toHaveText('document:doc')
    await expect(contentErrors).toHaveText('[]')

    const beforeSummary = await captureOutlineVisualSummary(page)
    await expect(editor).toHaveScreenshot('outline-focus-compare-root.png', {
      animations: 'disabled',
      caret: 'hide',
      scale: 'css',
    })

    await rootMarker.click()

    await expect.poll(async () => {
      const count = await focusState.count()
      return {
        count,
        contentErrors: count === 0 ? null : await contentErrors.textContent(),
        pageErrors,
        text: count === 0 ? null : await focusState.textContent(),
      }
    }).toEqual({
      count: 1,
      contentErrors: '[]',
      pageErrors: [],
      text: 'subtree:outlineUList:item-aaa',
    })

    await expect.poll(async () => {
      return captureOutlineVisualSummary(page)
    }).toEqual(beforeSummary)

    const afterSummary = await captureOutlineVisualSummary(page)
    await expect(editor).toHaveScreenshot('outline-focus-compare-root.png', {
      animations: 'disabled',
      caret: 'hide',
      scale: 'css',
    })

    expect(pageErrors).toEqual([])
    await expect(contentErrors).toHaveText('[]')
    expect(afterSummary).toEqual(beforeSummary)
  })
})
