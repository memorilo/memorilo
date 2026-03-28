import { expect, test } from '@playwright/test'

test.describe('outline nested focus', () => {
  test('focuses the clicked nested branch and shows only that subtree', async ({ page }) => {
    const pageErrors: string[] = []
    page.on('pageerror', error => pageErrors.push(error.message))
    await page.addInitScript(() => {
      const generatedIds = ['id-aaa', 'id-bbb', 'id-ccc', 'id-ddd', 'id-eee', 'id-fff', 'id-ggg', 'id-hhh']
      let nextIdIndex = 0
      Object.defineProperty(globalThis.crypto, 'randomUUID', {
        configurable: true,
        value: () => {
          const nextId = generatedIds[nextIdIndex]
          if (nextId === undefined) {
            throw new Error(`Unexpected extra randomUUID call #${nextIdIndex + 1}`)
          }
          nextIdIndex += 1
          return nextId
        },
      })
    })

    await page.goto('outline-focus-nested/')

    const editor = page.getByTestId('outline-focus-nested-editor')
    const focusState = page.getByTestId('outline-focus-nested-state')
    const contentErrors = page.getByTestId('outline-focus-nested-errors')
    const markerButtons = page.getByRole('button', { name: 'Open outline item' })

    await expect(focusState).toHaveText('document:doc')
    await expect(contentErrors).toHaveText('[]')

    await expect.poll(async () => {
      return editor.locator('p').allTextContents()
    }).toEqual(['aaa', 'bbb', 'ccc', 'ddd'])

    await markerButtons.nth(1).click()

    await expect.poll(async () => {
      return {
        contentErrors: await contentErrors.textContent(),
        pageErrors,
        paragraphs: await editor.locator('p').allTextContents(),
        state: await focusState.textContent(),
      }
    }).toEqual({
      contentErrors: '[]',
      pageErrors: [],
      paragraphs: ['bbb', 'ccc'],
      state: 'subtree:outlineUList:id-bbb',
    })
  })
})
