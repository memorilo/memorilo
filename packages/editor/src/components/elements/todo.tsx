import type { RenderElementProps } from 'slate-react'
import type { TodoElementType } from '../../slate'
import { TodoSwitch } from '@memorilo/components/ui/todo-switch'
import { cn } from '@memorilo/utils'
import { useCallback } from 'react'
import { Transforms } from 'slate'
import { ReactEditor, useSlateStatic } from 'slate-react'

export function Todo(props: RenderElementProps) {
  const DONE_WITH_LINE_THROUGH = true // TODO: make this a user setting

  const editor = useSlateStatic()
  const toggleChecked = useCallback((value: boolean) => {
    const path = ReactEditor.findPath(editor, props.element)
    Transforms.setNodes(editor, { checked: value }, { at: path })
  }, [props.element, editor])

  return (
    <div {...props.attributes} className="py-1 flex items-start gap-2 leading-6">
      <span contentEditable={false} className="h-lh flex items-center select-none">
        <TodoSwitch
          checked={(props.element as TodoElementType).checked}
          onCheckedChange={toggleChecked}
          checkedTrackClassName="bg-green-500"
          uncheckedTrackClassName="bg-blue-300"
          checkedLabel="DONE"
          uncheckedLabel="TODO"
          checkedLabelClassName="text-white"
          uncheckedLabelClassName="text-slate-900"
          aria-label="Toggle TODO"
        />
      </span>
      <div className={cn('flex-1 min-w-0 wrap-break-word', {
        'text-muted-foreground line-through': (props.element as TodoElementType).checked && DONE_WITH_LINE_THROUGH,
      })}
      >
        {props.children}
      </div>
    </div>
  )
}
