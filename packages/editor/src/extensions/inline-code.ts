import Code from '@tiptap/extension-code'

export const InlineCode = Code.configure({
  HTMLAttributes: {
    class: 'font-mono text-sm text-red-500 bg-gray-100 px-1.5 py-1 mx-0.5 rounded-md',
  },
})

export default InlineCode
