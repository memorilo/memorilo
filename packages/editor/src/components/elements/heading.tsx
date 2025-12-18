import type { JSX } from 'react'
import type { RenderElementProps } from 'slate-react'
import { cn } from '@memorilo/utils'
import { Match } from 'effect'

export function Heading(props: RenderElementProps & { className?: string, headingSize: number }) {
  const HeadingTag = `h${props.headingSize}` as keyof JSX.IntrinsicElements

  return (
    <div
      {...props.attributes}
      className={cn(
        'font-blod',
        Match.value(props.headingSize).pipe(
          Match.when(1, () => 'text-3xl'),
          Match.when(2, () => 'text-2xl'),
          Match.when(3, () => 'text-xl'),
          Match.when(4, () => 'text-lg'),
          Match.when(5, () => 'text-base'),
          Match.when(6, () => 'text-base'),
          Match.orElse(() => 'text-base'),
        ),
        props.className,
      )}
    >
      <HeadingTag>{props.children}</HeadingTag>
    </div>
  )
}
