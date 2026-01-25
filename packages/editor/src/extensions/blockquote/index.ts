import Blockquote from '@tiptap/extension-blockquote'
import './blockquote.css'

export const BlockquoteExtension = Blockquote.configure({
  HTMLAttributes: {
    class: 'memorilo-blockquote',
  },
})
