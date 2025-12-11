import type { RenderElementProps } from 'slate-react'

export function Divider(props: RenderElementProps) {
  return (
    <div {...props.attributes} contentEditable={false} className="flex items-center">
      <span className="hidden select-none">{props.children}</span>
      <hr className="flex-1" />
    </div>
  )
}
