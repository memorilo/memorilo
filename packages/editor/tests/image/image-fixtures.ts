import type { JSONContent } from '@tiptap/core'

export const resizableImageUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="50" viewBox="0 0 100 50"><rect width="100" height="50" fill="#f97316"/></svg>',
)}`

export function createImageFixtureDocument(blocks: JSONContent[]): JSONContent {
  return {
    type: 'doc',
    content: [
      {
        type: 'outlineUList',
        content: [
          {
            type: 'outlineUordItem',
            content: blocks,
          },
        ],
      },
    ],
  }
}

export function createParagraphImageDoc(text?: string): JSONContent {
  if (text === undefined) {
    return createImageFixtureDocument([
      {
        type: 'paragraph',
      },
    ])
  }

  return createImageFixtureDocument([
    {
      type: 'paragraph',
      content: [
        {
          type: 'text',
          text,
        },
      ],
    },
  ])
}

export function createResizableImageDoc(width: number, height: number): JSONContent {
  return createImageFixtureDocument([
    {
      type: 'image',
      attrs: {
        src: resizableImageUrl,
        alt: 'Resizable image',
        title: null,
        width,
        height,
        assetId: 'resizable-asset',
      },
    },
  ])
}
