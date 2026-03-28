import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'
import {
  focusParagraph,
  gotoMathFixture,
} from './math-test-utils'

async function expectOpenPopoverPreview(page: Page, previewSelector: string) {
  await expect.poll(async () => {
    return await page.evaluate((selector) => {
      const isVisible = (element: Element | null) => {
        return element instanceof HTMLElement
          && element.getClientRects().length > 0
          && window.getComputedStyle(element).visibility !== 'hidden'
      }

      return Array.from(document.querySelectorAll('[data-state="open"]')).some((popover) => {
        if (!isVisible(popover)) {
          return false
        }

        const preview = popover.querySelector(selector)
        return isVisible(preview) && popover.querySelector('.text-red-600') === null
      })
    }, previewSelector)
  }).toBe(true)
}

test.describe('math preview popovers', () => {
  test('shows a rendered inline preview popover while editing an inline formula', async ({ page }) => {
    // Arrange: create a non-empty inline formula and remain in editing mode.
    await gotoMathFixture(page)
    await focusParagraph(page, 0, 'start')
    await page.keyboard.type('$$ ')
    await page.keyboard.type('x^2 + y^2')

    // Assert: the editing popover shows a rendered KaTeX preview.
    await expectOpenPopoverPreview(page, '.katex')
  })

  test('shows a rendered block preview popover while editing a block formula', async ({ page }) => {
    // Arrange: create a non-empty block formula and remain in editing mode.
    await gotoMathFixture(page)
    await focusParagraph(page, 0, 'start')
    await page.keyboard.type('$$$$ ')
    await page.keyboard.type('\\frac{1}{1+x}')

    // Assert: the editing popover shows the block KaTeX preview.
    await expectOpenPopoverPreview(page, '.katex-display')
  })
})
