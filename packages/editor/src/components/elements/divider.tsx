import type { RenderElementProps } from 'slate-react'

export function Divider(props: RenderElementProps) {
  return (
    <div {...props.attributes} contentEditable={false} className="flex items-center py-2">
      <span className="hidden select-none">{props.children}</span>
      <hr className="flex-1 border-border/70 m-0" />
    </div>
  )
}
