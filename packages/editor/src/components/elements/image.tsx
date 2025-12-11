import type { RenderElementProps } from 'slate-react'
import type { ImageElementType } from '../../slate'
import { DeleteIcon } from '@memorilo/components/ui/animiated-icons/delete'
import { Transforms } from 'slate'
import { ReactEditor, useSlateStatic } from 'slate-react'
import { UtilButton } from '../util-button'

export function Image(props: RenderElementProps) {
  const editor = useSlateStatic()
  const path = ReactEditor.findPath(editor, props.element)

  return (
    <div {...props.attributes} className="group relative flex max-w-lg flex-col">
      {props.children}
      <img alt="image" src={(props.element as ImageElementType).url} />
      <UtilButton
        onClick={() => Transforms.removeNodes(editor, { at: path })}
        className="absolute top-3 start-3 z-50 hidden text-sm group-hover:block"
      >
        <DeleteIcon size={16} />
      </UtilButton>

    </div>
  )
}
