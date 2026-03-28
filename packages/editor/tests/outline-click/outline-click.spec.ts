import { expect, test } from '@playwright/test'

test.describe('outline marker click interactions', () => {
  test('calls onOutlineClick with the outline item id when the marker is clicked', async ({ page }) => {
    const pageErrors: string[] = []
    page.on('pageerror', error => pageErrors.push(error.message))
    await page.addInitScript(() => {
      Object.defineProperty(globalThis.crypto, 'randomUUID', {
        configurable: true,
        value: () => 'generated-alpha',
      })
    })

    await page.goto('outline-click/')
    const marker = page.getByRole('button', { name: 'Open outline item' })
    const clickedId = page.getByTestId('outline-clicked-id')
    const switchHandler = page.getByRole('button', { name: 'Use second handler' })

    await expect(marker).toBeVisible()
    await marker.click()
    await expect(clickedId).toHaveText('first:generated-alpha')
    await switchHandler.click()
    await marker.click()
    await expect(clickedId).toHaveText('second:generated-alpha')
    expect(pageErrors).toEqual([])
  })

  test('assigns a distinct id to a newly split outline item before marker clicks', async ({ page }) => {
    const pageErrors: string[] = []
    page.on('pageerror', error => pageErrors.push(error.message))
    await page.addInitScript(() => {
      const generatedIds = ['id-1', 'id-2', 'id-3', 'id-4']
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

    await page.goto('outline-click/')

    const editor = page.getByTestId('outline-click-editor')
    const clickedId = page.getByTestId('outline-clicked-id')

    await editor.click()
    await page.keyboard.press('End')
    await page.keyboard.press('Enter')
    await page.keyboard.type('Beta')

    const markers = page.getByRole('button', { name: 'Open outline item' })
    await expect(markers).toHaveCount(2)

    await markers.nth(0).click()
    await expect(clickedId).toHaveText('first:id-1')
    const firstClickedId = await clickedId.textContent()

    await markers.nth(1).click()
    await expect(clickedId).toHaveText(/^first:id-/)
    const secondClickedId = await clickedId.textContent()

    expect(secondClickedId).not.toBe(firstClickedId)
    expect(pageErrors).toEqual([])
  })
})
