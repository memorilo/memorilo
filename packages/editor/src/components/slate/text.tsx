import type { RenderElementProps } from 'slate-react'

export function Text(props: RenderElementProps) {
  return <p {...props.attributes}>{props.children}</p>
}
