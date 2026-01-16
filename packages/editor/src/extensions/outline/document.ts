import type { HeadingLevel } from './heading'
import { mergeAttributes } from '@tiptap/core'
import Document from '@tiptap/extension-document'
import Heading from '@tiptap/extension-heading'
import { headingClassByLevel, headingLevels } from './heading'

export const BulletDocument = Document.extend({
  content: 'bulletList',
})

export const StyledHeading = Heading.extend({
  renderHTML({ node, HTMLAttributes }) {
    const rawLevel = Number(node.attrs.level)
    const level = headingLevels.includes(rawLevel as HeadingLevel) ? (rawLevel as HeadingLevel) : 1
    return [
      `h${level}`,
      mergeAttributes(HTMLAttributes, { class: headingClassByLevel[level] }),
      0,
    ]
  },
})
