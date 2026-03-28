import type { Page } from '@playwright/test'
import type { JSONContent } from '@tiptap/core'
import type { JsonNode } from '../editor-test-utils'
import { expect } from '@playwright/test'
import {
  focusParagraph as focusFixtureParagraph,
  readFixtureDoc,
} from '../editor-test-utils'

export type { JsonNode } from '../editor-test-utils'

export async function gotoImageFixture(page: Page) {
  await page.goto('image/')
  await page.waitForSelector('[data-testid="image-editor"] .ProseMirror p', { state: 'visible' })
  await expect.poll(async () => {
    const doc = await readImageDoc(page)
    return doc.content?.length ?? 0
  }).toBe(1)
}

export async function readImageDoc(page: Page): Promise<JsonNode> {
  return readFixtureDoc(page, 'image-json')
}

export async function focusImageParagraph(page: Page, index: number, edge: 'start' | 'end' = 'end') {
  await focusFixtureParagraph(page, 'image-editor', index, edge)
}

export async function setImageFixtureContent(page: Page, content: JSONContent) {
  await page.evaluate((nextContent) => {
    if (!window.__imageFixture) {
      throw new Error('Image fixture helpers are unavailable')
    }

    window.__imageFixture.setContent(nextContent)
  }, content)

  await expect.poll(async () => {
    const doc = await readImageDoc(page)
    return doc.content?.length ?? 0
  }).toBe(content.content?.length ?? 0)
}

export async function clearImageFixtureCalls(page: Page) {
  await page.evaluate(() => {
    if (!window.__imageFixture) {
      throw new Error('Image fixture helpers are unavailable')
    }

    window.__imageFixture.clearServiceCalls()
  })
}

export async function getImageFixtureCalls(page: Page) {
  return await page.evaluate(() => {
    if (!window.__imageFixture) {
      throw new Error('Image fixture helpers are unavailable')
    }

    return window.__imageFixture.getServiceCalls()
  })
}

export async function seedImageFixtureAsset(page: Page, assetId: string, extension: string | null) {
  await page.evaluate(({ seededAssetId, seededExtension }) => {
    if (!window.__imageFixture) {
      throw new Error('Image fixture helpers are unavailable')
    }

    window.__imageFixture.seedAsset(seededAssetId, seededExtension)
  }, {
    seededAssetId: assetId,
    seededExtension: extension,
  })
}

export async function pasteHtmlImage(page: Page, html: string) {
  await page.evaluate((payload) => {
    const editor = document.querySelector('[data-testid="image-editor"] .ProseMirror')
    if (!(editor instanceof HTMLElement)) {
      throw new TypeError('Image editor root not found')
    }

    const clipboardData = {
      files: [],
      getData(type: string) {
        if (type === 'text/html') {
          return payload
        }

        if (type === 'text/plain') {
          return ''
        }

        return ''
      },
    }

    const event = new Event('paste', { bubbles: true, cancelable: true })
    Object.defineProperty(event, 'clipboardData', {
      configurable: true,
      value: clipboardData,
    })

    editor.focus()
    editor.dispatchEvent(event)
  }, html)
}

export async function pasteImageFile(page: Page, file: { name: string, type: string, bytes: number[] }) {
  await page.evaluate((payload) => {
    const editor = document.querySelector('[data-testid="image-editor"] .ProseMirror')
    if (!(editor instanceof HTMLElement)) {
      throw new TypeError('Image editor root not found')
    }

    const clipboardFile = new File(
      [new Uint8Array(payload.bytes)],
      payload.name,
      { type: payload.type },
    )

    const clipboardData = {
      files: [clipboardFile],
      getData() {
        return ''
      },
    }

    const event = new Event('paste', { bubbles: true, cancelable: true })
    Object.defineProperty(event, 'clipboardData', {
      configurable: true,
      value: clipboardData,
    })

    editor.focus()
    editor.dispatchEvent(event)
  }, file)
}

export async function dragImageResizeHandle(
  page: Page,
  direction: 'top' | 'right' | 'bottom' | 'left' | 'bottom-right',
  deltaX: number,
  deltaY: number,
  options?: {
    holdShift?: boolean
  },
) {
  const handle = page.locator(`[data-resize-handle="${direction}"]`).first()
  await handle.waitFor({ state: 'visible' })

  const box = await handle.boundingBox()
  if (!box) {
    throw new Error(`Resize handle "${direction}" is not visible`)
  }

  const startX = box.x + box.width / 2
  const startY = box.y + box.height / 2

  await page.mouse.move(startX, startY)
  await page.mouse.down()
  if (options?.holdShift) {
    await page.keyboard.down('Shift')
  }
  await page.mouse.move(startX + deltaX, startY + deltaY)
  await page.mouse.up()
  if (options?.holdShift) {
    await page.keyboard.up('Shift')
  }
}

export async function hoverResizableImage(page: Page) {
  await page.locator('[data-resize-container][data-node="image"]').first().hover()
}

export async function selectResizableImage(page: Page) {
  await page.locator('[data-resize-container][data-node="image"] img').first().click()
}

export async function readImageResizeChrome(page: Page) {
  return await page.locator('[data-resize-container][data-node="image"]').first().evaluate((container) => {
    const wrapper = container.querySelector('[data-resize-wrapper]')
    if (!(wrapper instanceof HTMLElement)) {
      throw new TypeError('Image resize wrapper not found')
    }

    const cornerHandle = container.querySelector('[data-resize-handle="bottom-right"]')
    if (!(cornerHandle instanceof HTMLElement)) {
      throw new TypeError('Bottom-right resize handle not found')
    }

    const resolveBorderColor = (value: string) => {
      const probe = document.createElement('div')
      probe.style.borderTopStyle = 'solid'
      probe.style.borderTopColor = value
      document.body.appendChild(probe)

      const borderTopColor = window.getComputedStyle(probe).borderTopColor
      probe.remove()

      return borderTopColor
    }

    const wrapperAfter = window.getComputedStyle(wrapper, '::after')
    const handle = window.getComputedStyle(cornerHandle)

    return {
      overlayBorderColor: wrapperAfter.borderTopColor,
      overlayBorderWidth: wrapperAfter.borderTopWidth,
      handleOpacity: Number.parseFloat(handle.opacity),
      handleWidth: Number.parseFloat(handle.width),
      handleHeight: Number.parseFloat(handle.height),
      handleBorderColor: handle.borderTopColor,
      borderColor: resolveBorderColor('var(--border)'),
      ringColor: resolveBorderColor('var(--ring)'),
      transparentColor: resolveBorderColor('transparent'),
    }
  })
}
