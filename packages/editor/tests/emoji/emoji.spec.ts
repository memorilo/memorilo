import { expect, test } from '@playwright/test'
import {
  focusEmojiParagraph,
  getNodeText,
  getTopLevelBlocks,
  gotoEmojiFixture,
  readEmojiDoc,
} from './emoji-test-utils'

function readEmojiName(node: { attrs?: Record<string, unknown> } | undefined) {
  return typeof node?.attrs?.name === 'string' ? node.attrs.name : null
}

test.describe('emoji shortcuts', () => {
  test('opens a picker synced to the typed shortcode query and inserts the matching emoji on Enter', async ({ page }) => {
    await gotoEmojiFixture(page)
    await focusEmojiParagraph(page, 0, 'start')

    await page.keyboard.type(':rocket')

    const picker = page.locator('.EmojiPickerReact')
    await expect(picker).toBeVisible()
    await expect(picker.locator('input').first()).not.toBeVisible()
    await expect(picker.locator('input').first()).toHaveValue('rocket')
    await expect.poll(async () => {
      return await picker.evaluate((root) => {
        const nav = root.querySelector('.epr-category-nav')
        if (!(nav instanceof HTMLElement)) {
          throw new TypeError('Emoji picker category navigation not found')
        }

        return Math.round(nav.getBoundingClientRect().top - root.getBoundingClientRect().top)
      })
    }).toBeLessThanOrEqual(4)

    await page.keyboard.press('Enter')

    await expect.poll(async () => {
      const doc = await readEmojiDoc(page)
      const firstBlocks = getTopLevelBlocks(doc, 0)
      const firstParagraph = firstBlocks[0]
      const firstParagraphContent = firstParagraph?.content ?? []
      const firstEmoji = firstParagraphContent[0]

      return {
        blockTypes: firstBlocks.map(node => node.type),
        contentTypes: firstParagraphContent.map(node => node.type),
        emojiType: firstEmoji?.type ?? null,
        emojiName: readEmojiName(firstEmoji),
        trailingText: getNodeText(firstParagraphContent[1]),
      }
    }).toEqual({
      blockTypes: ['paragraph'],
      contentTypes: ['emoji'],
      emojiType: 'emoji',
      emojiName: 'rocket',
      trailingText: '',
    })
  })

  test('replaces a completed :name: shortcode with an emoji node', async ({ page }) => {
    await gotoEmojiFixture(page)
    await focusEmojiParagraph(page, 0, 'start')

    await page.keyboard.type(':wave: ')

    await expect.poll(async () => {
      const doc = await readEmojiDoc(page)
      const firstBlocks = getTopLevelBlocks(doc, 0)
      const firstParagraph = firstBlocks[0]
      const firstParagraphContent = firstParagraph?.content ?? []
      const firstEmoji = firstParagraphContent[0]

      return {
        blockTypes: firstBlocks.map(node => node.type),
        contentTypes: firstParagraphContent.map(node => node.type),
        emojiType: firstEmoji?.type ?? null,
        emojiName: readEmojiName(firstEmoji),
        trailingText: getNodeText(firstParagraphContent[1]),
      }
    }).toEqual({
      blockTypes: ['paragraph'],
      contentTypes: ['emoji', 'text'],
      emojiType: 'emoji',
      emojiName: 'wave',
      trailingText: ' ',
    })
  })

  test('clicking a picker result inserts the matching cat emoji instead of a shorter alias match', async ({ page }) => {
    await gotoEmojiFixture(page)
    await focusEmojiParagraph(page, 0, 'start')

    await page.keyboard.type(':joy')

    const picker = page.locator('.EmojiPickerReact')
    await expect(picker).toBeVisible()

    const catEmojiButton = picker.locator('button.epr-emoji').filter({ hasText: '😹' })
    await expect(catEmojiButton).toHaveAttribute('data-full-name', /cat/i)
    await catEmojiButton.click()

    await expect.poll(async () => {
      const doc = await readEmojiDoc(page)
      const firstBlocks = getTopLevelBlocks(doc, 0)
      const firstParagraph = firstBlocks[0]
      const firstParagraphContent = firstParagraph?.content ?? []
      const firstEmoji = firstParagraphContent[0]

      return {
        blockTypes: firstBlocks.map(node => node.type),
        contentTypes: firstParagraphContent.map(node => node.type),
        emojiType: firstEmoji?.type ?? null,
        emojiName: readEmojiName(firstEmoji),
        trailingText: getNodeText(firstParagraphContent[1]),
      }
    }).toEqual({
      blockTypes: ['paragraph'],
      contentTypes: ['emoji'],
      emojiType: 'emoji',
      emojiName: 'joy_cat',
      trailingText: '',
    })
  })

  test('resets keyboard selection to the first result when the shortcode query changes', async ({ page }) => {
    await gotoEmojiFixture(page)
    await focusEmojiParagraph(page, 0, 'start')

    await page.keyboard.type(':rocket')
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('Backspace')
    await page.keyboard.press('Enter')

    await expect.poll(async () => {
      const doc = await readEmojiDoc(page)
      const firstBlocks = getTopLevelBlocks(doc, 0)
      const firstParagraph = firstBlocks[0]
      const firstParagraphContent = firstParagraph?.content ?? []
      const firstEmoji = firstParagraphContent[0]

      return {
        blockTypes: firstBlocks.map(node => node.type),
        contentTypes: firstParagraphContent.map(node => node.type),
        emojiType: firstEmoji?.type ?? null,
        emojiName: readEmojiName(firstEmoji),
        trailingText: getNodeText(firstParagraphContent[1]),
      }
    }).toEqual({
      blockTypes: ['paragraph'],
      contentTypes: ['emoji'],
      emojiType: 'emoji',
      emojiName: 'rocket',
      trailingText: '',
    })
  })
})
