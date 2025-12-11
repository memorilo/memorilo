import type { RenderElementProps } from 'slate-react'

export function CodeBlock(props: RenderElementProps) {
  return (
    <pre className="rounded p-8 font-mono text-sm border bg-secondary/10">
      <code {...props.attributes}>
        {props.children}
      </code>
    </pre>
  )
}
