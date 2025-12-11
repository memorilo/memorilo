import type { RenderElementProps } from 'slate-react'

export function Quote(props: RenderElementProps) {
  return (
    <blockquote
      {...props.attributes}
      className="border-l-4 border-primary pl-4 italic"
    >
      {props.children}
    </blockquote>
  )
}
