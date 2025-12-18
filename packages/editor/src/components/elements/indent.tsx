import type { RenderElementProps } from 'slate-react'
import { createContext, use, useMemo } from 'react'
import { Node, Path, Element as SlateElement } from 'slate'
import { ReactEditor, useSlateStatic } from 'slate-react'

const IndentEnableContext = createContext(false)

export function RootIndentEnableContext(props: { children: React.ReactNode, enable: boolean }) {
  return (
    <IndentEnableContext value={props.enable}>
      { props.children }
    </IndentEnableContext>
  )
}

function useIndentConnections(element: SlateElement) {
  const editor = useSlateStatic()

  return useMemo(() => {
    let hasIndentAbove = false
    let hasIndentBelow = false
    const path = ReactEditor.findPath(editor, element)

    try {
      if (path[path.length - 1] > 0) {
        const prevPath = Path.previous(path)
        if (Node.has(editor, prevPath)) {
          const prevNode = Node.get(editor, prevPath)
          if (SlateElement.isElement(prevNode) && (prevNode as any).type === 'indent') {
            hasIndentAbove = true
          }
        }
      }
    }
    catch {
      hasIndentAbove = false
    }

    try {
      const nextPath = Path.next(path)
      if (Node.has(editor, nextPath)) {
        const nextNode = Node.get(editor, nextPath)
        if (SlateElement.isElement(nextNode) && (nextNode as any).type === 'indent') {
          hasIndentBelow = true
        }
      }
    }
    catch {
      hasIndentBelow = false
    }

    return { hasIndentAbove, hasIndentBelow }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, element, editor.children])
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
