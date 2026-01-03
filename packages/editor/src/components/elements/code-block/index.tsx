import type { RenderElementProps } from 'slate-react'
import { lazy, Suspense } from 'react'

const CodeBlockLazy = lazy(() => import('./code-block').then(module => ({ default: module.CodeBlock })))
export const CodeLine = lazy(() => import('./code-block').then(module => ({ default: module.CodeLine })))
export function CodeBlock(props: RenderElementProps) {
  return (
    <Suspense>
      <CodeBlockLazy {...props} />
    </Suspense>
  )
}
