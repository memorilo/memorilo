import type { RenderElementProps } from 'slate-react'
import type { ImageElementType } from '../../slate'
import { DeleteIcon } from '@memorilo/components/ui/animiated-icons/delete'
import { useCallback } from 'react'
import { Transforms } from 'slate'
import { ReactEditor, useSlateStatic } from 'slate-react'
import { UtilButton } from '../util-button'

export function Image(props: RenderElementProps) {
  const editor = useSlateStatic()
  const handleDeleteMouseDown = useCallback(() => {
    const path = ReactEditor.findPath(editor, props.element)
    Transforms.removeNodes(editor, { at: path })
  }, [props.element, editor])

  return (
    <div {...props.attributes} className="max-w-lg">
      {props.children}
      <div className="group relative flex flex-col" contentEditable={false}>
        <img contentEditable={false} alt="image" src={(props.element as ImageElementType).url} />
        <UtilButton
        // Make the control non-editable so Slate doesn't treat it as content
          contentEditable={false}
          onMouseDown={handleDeleteMouseDown}
          className="absolute top-3 left-3 z-50 hidden text-sm group-hover:block"
        >
          <DeleteIcon size={16} />
        </UtilButton>

      </div>
    </div>
  )
}
