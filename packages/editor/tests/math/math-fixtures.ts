import type { JSONContent } from '@tiptap/core'

export const complexOutlineMathDocument: JSONContent = {
  type: 'doc',
  content: [
    {
      type: 'outlineUList',
      content: [
        {
          type: 'outlineUordItem',
          content: [
            {
              type: 'paragraph',
              content: [
                { type: 'text', text: 'Root ' },
                { type: 'inlineMath', content: [{ type: 'text', text: 'a^2+b^2' }] },
              ],
            },
          ],
        },
        {
          type: 'outlineUList',
          content: [
            {
              type: 'outlineUordItem',
              content: [
                {
                  type: 'paragraph',
                  content: [
                    { type: 'text', text: 'Child ' },
                    { type: 'inlineMath', content: [{ type: 'text', text: '\\alpha+\\beta' }] },
                  ],
                },
                {
                  type: 'blockMath',
                  content: [{ type: 'text', text: 'x = y + z' }],
                },
              ],
            },
          ],
        },
        {
          type: 'outlineOrdList',
          content: [
            {
              type: 'outlineOrdItem',
              attrs: { number: 1 },
              content: [
                {
                  type: 'paragraph',
                  content: [
                    { type: 'text', text: 'Nested ordered ' },
                    { type: 'inlineMath', content: [{ type: 'text', text: '\\sqrt{n}' }] },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
    {
      type: 'outlineUList',
      content: [
        {
          type: 'outlineUordItem',
          content: [
            {
              type: 'blockMath',
              content: [{ type: 'text', text: '\\int_0^1 x^2 dx' }],
            },
            {
              type: 'paragraph',
              content: [
                { type: 'text', text: 'Tail ' },
                { type: 'inlineMath', content: [{ type: 'text', text: '\\gamma' }] },
                { type: 'text', text: ' Omega' },
              ],
            },
          ],
        },
      ],
    },
  ],
}
