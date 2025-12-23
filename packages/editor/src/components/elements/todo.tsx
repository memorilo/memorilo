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
    <div {...props.attributes} className="py-1 flex items-start gap-2 leading-6">
      <span contentEditable={false} className="h-lh flex items-center select-none">
        <input
          type="checkbox"
          className="size-4 cursor-pointer accent-blue-300 checked:border-0"
          checked={(props.element as TodoElementType).checked}
          onChange={e => toggleChecked(e.target.checked)}
        />
      </span>
      <div className="flex-1 min-w-0 wrap-break-word">
        {props.children}
      </div>
    </div>
  )
}
