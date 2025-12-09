import type { RenderElementProps, RenderLeafProps } from 'slate-react'
import { cn } from '@memorilo/utils'
import { Match } from 'effect'
import { CodeBlock } from './code-block'
import { Text } from './text'

type TypedRenderElementProps = RenderElementProps & {
  element: {
    type: string
  }
}
export function renderElement(props: TypedRenderElementProps) {
  return Match.value(props)
    .pipe(
      Match.when({ element: { type: 'code' } }, () => <CodeBlock {...props} />),
      Match.orElse(() => <Text {...props} />),
    )
}

export function renderLeaf(props: RenderLeafProps) {
  return (
    <span
      {...props.attributes}
      className={
        cn(
          {
            'font-bold': (props.leaf as any).bold,
          },
        )
      }
    >
      {props.children}
    </span>
  )
}
