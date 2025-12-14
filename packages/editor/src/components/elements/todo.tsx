import type { RenderElementProps } from 'slate-react'
import type { TodoElementType } from '../../slate'
import { useCallback } from 'react'
import { Transforms } from 'slate'
import { ReactEditor, useSlateStatic } from 'slate-react'

export function Todo(props: RenderElementProps) {
  const editor = useSlateStatic()
  const toggleChecked = useCallback((value: boolean) => {
    const path = ReactEditor.findPath(editor, props.element)
    Transforms.setNodes(editor, { checked: value }, { at: path })
  }, [props.element, editor])

  return (
    <div className="mb-4 flex items-center">
      <input
        type="checkbox"
        className="mr-2 h-5 w-5 cursor-pointer accent-blue-300 checked:border-0"
        checked={(props.element as TodoElementType).checked}
        onChange={e => toggleChecked(e.target.checked)}
        {...props.attributes}
      />
      {props.children}
    </div>
  )
}
