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
          Match.when(1, () => 'text-3xl !mt-6'),
          Match.when(2, () => 'text-2xl !mt-5'),
          Match.when(3, () => 'text-xl !mt-4'),
          Match.when(4, () => 'text-lg !mt-3'),
          Match.when(5, () => 'text-base !mt-2'),
          Match.when(6, () => 'text-base !mt-1'),
          Match.orElse(() => 'text-base !mt-2'),
        ),
        props.className,
      )}
    >
      <HeadingTag>{props.children}</HeadingTag>
    </div>
  )
}
