import Code from '@tiptap/extension-code'
import './inline-code.css'

export const InlineCodeExtension = Code.configure({
  HTMLAttributes: {
    class: 'memorilo-inline-code',
  },
})
