import type { RenderElementProps } from 'slate-react'
import type { TodoElementType } from '../../slate'

export function Todo(props: RenderElementProps) {
  return (
    <div className="mb-4 flex items-center">
      <input
        type="checkbox"
        className="mr-2 h-5 w-5 cursor-pointer accent-blue-300 checked:border-0"
        checked={(props.element as TodoElementType).checked}
        {...props.attributes}
      />
      {props.children}
    </div>
  )
}
