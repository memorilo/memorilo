import { Provider } from 'jotai'
import { useMemo } from 'react'
import { createEditor } from 'slate'
import { Editable, Slate, withReact } from 'slate-react'

const initialValue = [
  {
    type: 'paragraph',
    children: [{ text: 'A line of text in a paragraph.' }],
  },
]

interface MemoriloEditorProps {
  className?: string
}

export function MemoriloEditor({ className }: MemoriloEditorProps) {
  const editor = useMemo(() => withReact(createEditor()), [])
  return (
    <Provider>
      <Slate editor={editor} initialValue={initialValue}>
        <Editable className={className} />
      </Slate>
    </Provider>
  )
}
