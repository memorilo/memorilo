import type { RenderElementProps } from 'slate-react'
import { createContext, use } from 'react'
import { Node, Path, Element as SlateElement } from 'slate'
import { ReactEditor, useSlateSelector } from 'slate-react'

const IndentEnableContext = createContext(false)

export function RootIndentEnableContext(props: { children: React.ReactNode, enable: boolean }) {
  return (
    <IndentEnableContext value={props.enable}>
      { props.children }
    </IndentEnableContext>
  )
}

function useIndentConnections(element: SlateElement) {
  const hasIndentAbove = useSlateSelector((editor) => {
    try {
      const path = ReactEditor.findPath(editor, element)

      if (path[path.length - 1] > 0) {
        const prevPath = Path.previous(path)
        if (Node.has(editor, prevPath)) {
          const prevNode = Node.get(editor, prevPath)
          if (SlateElement.isElement(prevNode) && (prevNode as any).type === 'indent') {
            return true
          }
        }
      }
    }
    catch {}
    return false
  })

  const hasIndentBelow = useSlateSelector((editor) => {
    try {
      const path = ReactEditor.findPath(editor, element)
      const nextPath = Path.next(path)
      if (Node.has(editor, nextPath)) {
        const nextNode = Node.get(editor, nextPath)
        if (SlateElement.isElement(nextNode) && (nextNode as any).type === 'indent') {
          return true
        }
      }
    }
    catch {}
    return false
  })

  return { hasIndentAbove, hasIndentBelow }
}

export function Indent(props: RenderElementProps) {
  const enabled = use(IndentEnableContext)
  const { hasIndentAbove, hasIndentBelow } = useIndentConnections(props.element)

  if (!enabled) {
    // TODO: test this branch
    return (
      <div {...props.attributes}>
        {props.children}
      </div>
    )
  }

  return (
    <div className="pl-8 relative" {...props.attributes}>
      <span
        contentEditable={false}
        className="absolute left-0 top-0 bottom-0 flex w-[1em] justify-center select-none"
      >
        {hasIndentAbove && (
          <span className="absolute top-0 h-[0.5lh] w-px bg-border" />
        )}
        <span className="absolute top-[0.5lh] -translate-y-1/2 h-1.25 w-1.25 rounded-full bg-foreground z-10" />
        <span className={`absolute top-[0.5lh] w-px bg-border ${hasIndentBelow ? 'bottom-0' : 'bottom-2'}`} />
      </span>
      {props.children}
    </div>
  )
}
