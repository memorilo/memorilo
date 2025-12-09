import { Button } from '@memorilo/components/ui/button'
import { Match } from 'effect'
import { Provider } from 'jotai'
import { useMemo } from 'react'
import { createEditor, Editor, Element, Transforms } from 'slate'
import { Editable, Slate, withReact } from 'slate-react'
import { renderElement, renderLeaf } from './components/slate'

const initialValue = [
  {
    type: 'paragraph',
    children: [{ text: 'A line of text in a paragraph.' }],
  },
]

interface MemoriloEditorProps {
  className?: string
}

const EditorActions = {
  isBoldMarkActive(editor: Editor) {
    const marks = Editor.marks(editor)
    return marks ? (marks as any).bold === true : false
  },
  isCodeBlockActive(editor: Editor) {
    const [match] = Editor.nodes(editor, {
      match: n => (n as any).type === 'code',
    })

    return !!match
  },

  toggleBoldMark(editor: Editor) {
    const isActive = EditorActions.isBoldMarkActive(editor)
    if (isActive) {
      Editor.removeMark(editor, 'bold')
    }
    else {
      Editor.addMark(editor, 'bold', true)
    }
  },

  toggleCodeBlock(editor: Editor) {
    const isActive = EditorActions.isCodeBlockActive(editor)
    Transforms.setNodes(
      editor,
      { type: isActive ? null : 'code' } as Partial<Node>,
      { match: n => Element.isElement(n) && Editor.isBlock(editor, n) },
    )
  },

}

export function MemoriloEditor({ className }: MemoriloEditorProps) {
  const editor = useMemo(() => withReact(createEditor()), [])
  return (
    <Provider>
      <Slate editor={editor} initialValue={initialValue}>
        <div className="flex items-center gap-2 justify-center border p-2 m-2">
          <Button
            onClick={(e) => {
              e.preventDefault()
              EditorActions.toggleBoldMark(editor)
            }}
            size="sm"
          >
            Bold
          </Button>
          <Button
            onClick={(e) => {
              e.preventDefault()
              EditorActions.toggleCodeBlock(editor)
            }}
            size="sm"
          >
            Codefench
          </Button>
        </div>
        <Editable
          renderElement={renderElement as any}
          renderLeaf={renderLeaf}
          className={className}
          onKeyDown={(event) => {
            Match.value(event)
              .pipe(
                Match.when({ key: 'l', ctrlKey: true }, () => {
                  event.preventDefault()
                  EditorActions.toggleBoldMark(editor)
                }),
                Match.when({ key: '`', ctrlKey: true }, () => {
                  event.preventDefault()
                  EditorActions.toggleCodeBlock(editor)
                }),
              )
          }}
        />
      </Slate>
    </Provider>
  )
}
