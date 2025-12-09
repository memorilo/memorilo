import type { RenderElementProps } from 'slate-react'

export function CodeBlock(props: RenderElementProps) {
  return (
    <pre className="rounded p-8 font-mono text-sm border">
      <code {...props.attributes}>
        {props.children}
      </code>
    </pre>
  )
}
