import type { Page } from '@playwright/test'
import type { ImageFixtureCall } from './runtime'
import { expect } from '@playwright/test'
import { resizableImageUrl } from './image-fixtures'
import { getImageFixtureCalls, readImageDoc } from './image-test-utils'

export async function expectSingleImageAttrs(
  page: Page,
  expectedAttrs: Record<string, unknown>,
) {
  await expect.poll(async () => {
    const doc = await readImageDoc(page)
    const imageNode = doc.content?.[0]?.content?.[0]?.content?.[0]

    return {
      type: imageNode?.type,
      attrs: imageNode?.attrs,
    }
  }).toEqual({
    type: 'image',
    attrs: expectedAttrs,
  })
}

export async function expectParagraphThenImage(
  page: Page,
  paragraphText: string,
  imageAttrs: Record<string, unknown>,
) {
  await expect.poll(async () => {
    const doc = await readImageDoc(page)
    const blocks = doc.content?.[0]?.content?.[0]?.content ?? []
    const paragraphNode = blocks[0]
    const imageNode = blocks[1]

    return {
      blockTypes: blocks.map(node => node.type),
      paragraphText: paragraphNode?.content?.[0]?.text,
      imageAttrs: imageNode?.attrs,
    }
  }).toEqual({
    blockTypes: ['paragraph', 'image'],
    paragraphText,
    imageAttrs,
  })
}

export async function expectImageFixtureCalls(page: Page, expectedCalls: ImageFixtureCall[]) {
  await expect.poll(async () => getImageFixtureCalls(page)).toEqual(expectedCalls)
}

export async function expectResizableImageAttrs(page: Page, width: number, height: number) {
  await expectSingleImageAttrs(page, {
    src: resizableImageUrl,
    alt: 'Resizable image',
    title: null,
    width,
    height,
    assetId: 'resizable-asset',
  })
}
