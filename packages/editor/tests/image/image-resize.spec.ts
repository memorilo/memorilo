import { expect, test } from '@playwright/test'
import { expectResizableImageAttrs } from './image-assertions'
import { createImageFixtureDocument, createResizableImageDoc, resizableImageUrl } from './image-fixtures'
import {
  clearImageFixtureCalls,
  dragImageResizeHandle,
  focusImageParagraph,
  gotoImageFixture,
  hoverResizableImage,
  readImageResizeChrome,
  selectResizableImage,
  setImageFixtureContent,
} from './image-test-utils'

test.describe('image resize handling', () => {
  test('resizes width from the right edge and persists it', async ({ page }) => {
    await gotoImageFixture(page)
    await clearImageFixtureCalls(page)

    await setImageFixtureContent(page, createResizableImageDoc(100, 50))
    await dragImageResizeHandle(page, 'right', 40, 0)

    await expectResizableImageAttrs(page, 140, 50)
  })

  test('resizes width from the left edge and persists it', async ({ page }) => {
    await gotoImageFixture(page)
    await clearImageFixtureCalls(page)

    await setImageFixtureContent(page, createResizableImageDoc(100, 50))
    await dragImageResizeHandle(page, 'left', -30, 0)

    await expectResizableImageAttrs(page, 130, 50)
  })

  test('resizes height from the bottom edge and persists it', async ({ page }) => {
    await gotoImageFixture(page)
    await clearImageFixtureCalls(page)

    await setImageFixtureContent(page, createResizableImageDoc(100, 50))
    await dragImageResizeHandle(page, 'bottom', 0, 30)

    await expectResizableImageAttrs(page, 100, 80)
  })

  test('resizes height from the top edge and persists it', async ({ page }) => {
    await gotoImageFixture(page)
    await clearImageFixtureCalls(page)

    await setImageFixtureContent(page, createResizableImageDoc(100, 50))
    await dragImageResizeHandle(page, 'top', 0, -20)

    await expectResizableImageAttrs(page, 100, 70)
  })

  test('resizes from the bottom-right corner and persists width and height', async ({ page }) => {
    await gotoImageFixture(page)
    await clearImageFixtureCalls(page)

    await setImageFixtureContent(page, createResizableImageDoc(100, 50))
    await dragImageResizeHandle(page, 'bottom-right', 40, 20)

    await expectResizableImageAttrs(page, 140, 70)
  })

  test('resizes proportionally from the bottom-right corner while holding Shift', async ({ page }) => {
    await gotoImageFixture(page)
    await clearImageFixtureCalls(page)

    await setImageFixtureContent(page, createResizableImageDoc(100, 50))
    await dragImageResizeHandle(page, 'bottom-right', 40, 60, {
      holdShift: true,
    })

    await expectResizableImageAttrs(page, 140, 70)
  })

  test('shows a shadcn border and a small corner handle on hover', async ({ page }) => {
    await gotoImageFixture(page)
    await clearImageFixtureCalls(page)

    await setImageFixtureContent(page, createImageFixtureDocument([
      {
        type: 'paragraph',
        content: [
          {
            type: 'text',
            text: 'Alpha',
          },
        ],
      },
      {
        type: 'image',
        attrs: {
          src: resizableImageUrl,
          alt: 'Resizable image',
          title: null,
          width: 100,
          height: 50,
          assetId: 'resizable-asset',
        },
      },
    ]))
    await focusImageParagraph(page, 0)
    await page.mouse.move(1, 1)

    const { borderColor, transparentColor } = await readImageResizeChrome(page)

    await expect.poll(async () => {
      const chrome = await readImageResizeChrome(page)

      return {
        overlayBorderColor: chrome.overlayBorderColor,
        handleOpacity: chrome.handleOpacity,
      }
    }).toEqual({
      overlayBorderColor: transparentColor,
      handleOpacity: 0,
    })

    await hoverResizableImage(page)

    await expect.poll(async () => {
      const chrome = await readImageResizeChrome(page)

      return {
        overlayBorderColor: chrome.overlayBorderColor,
        overlayBorderWidth: chrome.overlayBorderWidth,
        handleOpacity: chrome.handleOpacity,
        handleWidth: chrome.handleWidth,
        handleHeight: chrome.handleHeight,
        handleBorderColor: chrome.handleBorderColor,
      }
    }).toEqual({
      overlayBorderColor: borderColor,
      overlayBorderWidth: '1px',
      handleOpacity: 1,
      handleWidth: 10,
      handleHeight: 10,
      handleBorderColor: borderColor,
    })
  })

  test('uses the ring color when the image is selected', async ({ page }) => {
    await gotoImageFixture(page)
    await clearImageFixtureCalls(page)

    await setImageFixtureContent(page, createResizableImageDoc(100, 50))
    const { ringColor } = await readImageResizeChrome(page)

    await selectResizableImage(page)

    await expect.poll(async () => {
      const chrome = await readImageResizeChrome(page)

      return {
        overlayBorderColor: chrome.overlayBorderColor,
        handleOpacity: chrome.handleOpacity,
        handleBorderColor: chrome.handleBorderColor,
      }
    }).toEqual({
      overlayBorderColor: ringColor,
      handleOpacity: 1,
      handleBorderColor: ringColor,
    })
  })
})
