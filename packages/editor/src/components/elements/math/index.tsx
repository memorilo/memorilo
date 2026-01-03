import type { RenderElementProps } from 'slate-react'
import { lazy, Suspense } from 'react'

const MathInlineLazy = lazy(() => import('./math-inline').then(module => ({ default: module.MathInline })))
const MathBlockLazy = lazy(() => import('./math-block').then(module => ({ default: module.MathBlock })))

export function MathInline(props: RenderElementProps) {
  return (
    <Suspense>
      <MathInlineLazy {...props} />
    </Suspense>
  )
}

export function MathBlock(props: RenderElementProps) {
  return (
    <Suspense>
      <MathBlockLazy {...props} />
    </Suspense>
  )
}
