import { expect, test } from '@playwright/test'
import {
  expectImageFixtureCalls,
  expectParagraphThenImage,
  expectSingleImageAttrs,
} from './image-assertions'
import { createParagraphImageDoc } from './image-fixtures'
import {
  clearImageFixtureCalls,
  focusImageParagraph,
  gotoImageFixture,
  pasteHtmlImage,
  pasteImageFile,
  readImageDoc,
  seedImageFixtureAsset,
  setImageFixtureContent,
} from './image-test-utils'

test.describe('image paste handling', () => {
  test('replaces an empty paragraph with a downloaded remote image', async ({ page }) => {
    await gotoImageFixture(page)
    await clearImageFixtureCalls(page)
    await focusImageParagraph(page, 0, 'start')

    await pasteHtmlImage(
      page,
      '<img src="https://example.com/cat.png" alt="Cat" title="Example title" width="320" height="180">',
    )

    await expect.poll(async () => {
      const doc = await readImageDoc(page)
      const blocks = doc.content?.[0]?.content?.[0]?.content ?? []
      const imageNode = blocks[0]

      return {
        blockTypes: blocks.map(node => node.type),
        imageType: imageNode?.type,
        imageAttrs: imageNode?.attrs,
      }
    }).toEqual({
      blockTypes: ['image'],
      imageType: 'image',
      imageAttrs: {
        src: 'mock://assets/asset-1.png',
        alt: 'Cat',
        title: 'Example title',
        width: 320,
        height: 180,
        assetId: 'asset-1',
      },
    })

    await expectImageFixtureCalls(page, [
      {
        kind: 'addAssetFromUrl',
        url: 'https://example.com/cat.png',
      },
      {
        kind: 'getAssetUrl',
        assetId: 'asset-1',
        useHttps: null,
      },
    ])
  })

  test('replaces an empty paragraph with a data URL image stored via addAssetFromBase64', async ({ page }) => {
    await gotoImageFixture(page)
    await clearImageFixtureCalls(page)
    await focusImageParagraph(page, 0, 'start')

    const dataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB'

    await pasteHtmlImage(
      page,
      `<img src="${dataUrl}" alt="" width="48" height="48">`,
    )

    await expectSingleImageAttrs(page, {
      src: 'mock://assets/asset-1.png',
      alt: '',
      title: null,
      width: 48,
      height: 48,
      assetId: 'asset-1',
    })

    await expectImageFixtureCalls(page, [
      {
        kind: 'addAssetFromBase64',
        base64: dataUrl,
        extension: 'png',
        meta: JSON.stringify({
          source: 'data-url',
          mimeType: 'image/png',
        }),
      },
      {
        kind: 'getAssetUrl',
        assetId: 'asset-1',
        useHttps: null,
      },
    ])
  })

  test('replaces an empty paragraph with a pasted clipboard file image', async ({ page }) => {
    await gotoImageFixture(page)
    await clearImageFixtureCalls(page)
    await focusImageParagraph(page, 0, 'start')

    await pasteImageFile(page, {
      name: 'clipboard.png',
      type: 'image/png',
      bytes: [137, 80, 78, 71, 1, 2, 3, 4],
    })

    await expectSingleImageAttrs(page, {
      src: 'mock://assets/asset-1.png',
      alt: null,
      title: null,
      width: null,
      height: null,
      assetId: 'asset-1',
    })

    await expectImageFixtureCalls(page, [
      {
        kind: 'addAssetFromBytes',
        bytes: [137, 80, 78, 71, 1, 2, 3, 4],
        extension: 'png',
        meta: JSON.stringify({
          source: 'clipboard-file',
          mimeType: 'image/png',
          name: 'clipboard.png',
        }),
      },
      {
        kind: 'getAssetUrl',
        assetId: 'asset-1',
        useHttps: null,
      },
    ])
  })

  test('replaces an empty paragraph with an existing local asset image', async ({ page }) => {
    await gotoImageFixture(page)
    await seedImageFixtureAsset(page, 'existing-asset', 'png')
    await clearImageFixtureCalls(page)

    await setImageFixtureContent(page, createParagraphImageDoc())
    await focusImageParagraph(page, 0, 'start')

    await pasteHtmlImage(
      page,
      '<img src="mock://assets/existing-asset.png" data-asset-id="existing-asset" alt="Existing">',
    )

    await expectSingleImageAttrs(page, {
      src: 'mock://assets/existing-asset.png',
      alt: 'Existing',
      title: null,
      width: null,
      height: null,
      assetId: 'existing-asset',
    })

    await expectImageFixtureCalls(page, [])
  })

  test('inserts an image below a non-empty paragraph instead of replacing it', async ({ page }) => {
    await gotoImageFixture(page)
    await seedImageFixtureAsset(page, 'below-text', 'png')
    await clearImageFixtureCalls(page)

    await setImageFixtureContent(page, createParagraphImageDoc('Alpha'))
    await focusImageParagraph(page, 0, 'end')

    await pasteHtmlImage(
      page,
      '<img src="mock://assets/below-text.png" data-asset-id="below-text" alt="Below text">',
    )

    await expectParagraphThenImage(page, 'Alpha', {
      src: 'mock://assets/below-text.png',
      alt: 'Below text',
      title: null,
      width: null,
      height: null,
      assetId: 'below-text',
    })

    await expectImageFixtureCalls(page, [])
  })
})
