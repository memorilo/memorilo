import type { RenderElementProps } from 'slate-react'
import { ChevronDownIcon } from '@memorilo/components/ui/animiated-icons/chevron-down'
import { GripVerticalIcon } from '@memorilo/components/ui/animiated-icons/grip-vertical'
import { Button } from '@memorilo/components/ui/button'
import { AnimatePresence, motion } from 'motion/react'
import { createContext, use, useEffect, useMemo, useState } from 'react'
import { Node, Path, Element as SlateElement } from 'slate'
import { ReactEditor, useFocused, useSelected, useSlateSelector } from 'slate-react'

const MotionButton = motion(Button)

const IndentEnableContext = createContext(false)
interface IndentChildCollapseContextValueType {
  collapsed: boolean
  setCollapsed: (collapsed: boolean) => void
}
const IndentChildCollapseContext = createContext<IndentChildCollapseContextValueType>({
  collapsed: false,
  setCollapsed: () => {},
})

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
  const { collapsed, setCollapsed } = use(IndentChildCollapseContext)
  const enabled = use(IndentEnableContext)
  const { hasIndentAbove, hasIndentBelow } = useIndentConnections(props.element)
  const [childExpanded, setChildExpanded] = useState(true)
  const expandable = props.element.children.length > 1
  const contentGap = '1em'
  const isFocused = useFocused()
  const isSelected = useSelected()

  const childCollapsed = useMemo(() => ({
    collapsed: !childExpanded,
    setCollapsed: (collapsed: boolean) => {
      setChildExpanded(!collapsed)
    },
  }), [childExpanded])

  useEffect(() => {
    if (isFocused && isSelected) {
      setCollapsed(false)
    }
  }, [isFocused, isSelected, setCollapsed])

  const showButtons = useSlateSelector((editor) => {
    if (!editor.selection || !ReactEditor.isFocused(editor))
      return false
    try {
      const path = ReactEditor.findPath(editor, props.element)
      const firstChildPath = path.concat([0])
      return Path.isAncestor(firstChildPath, editor.selection.anchor.path) || Path.equals(firstChildPath, editor.selection.anchor.path)
    }
    catch {
      return false
    }
  })
  const toggleExpanded = () => {
    setChildExpanded(!childExpanded)
  }

  if (!enabled) {
    // TODO: test this branch
    return (
      <div {...props.attributes}>
        {props.children}
      </div>
    )
  }

  return (
    <motion.div
      className="relative"
      initial={false}
      animate={{
        height: collapsed ? 0 : 'auto',
        opacity: collapsed ? 0 : 1,
        transitionEnd: {
          overflow: collapsed ? 'hidden' : 'visible',
        },
      }}
      transition={{
        duration: 0.2,
      }}
      style={{
        paddingLeft: `calc(1.625rem + ${contentGap})`,
      }}
      data-collapsed={collapsed}
      {...props.attributes}
    >
      <span
        contentEditable={false}
        className="absolute left-4 top-0 bottom-0 flex w-1 justify-center select-none"
      >
        {hasIndentAbove && (
          <span className="absolute top-0 h-[0.5lh] w-px bg-border" />
        )}
        <span className="absolute top-[0.5lh] -translate-y-1/2 right-[calc(50%-0.5rem)] flex items-center z-10 gap-1">
          <AnimatePresence>
            {showButtons && (
              <motion.div
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                transition={{ type: 'spring', stiffness: 400, damping: 20 }}
                className="flex gap-1 items-center"
              >
                <Button
                  variant="outline"
                  size="icon-sm"
                  className="w-4"
                >
                  <GripVerticalIcon />
                </Button>
                {expandable && (
                  <MotionButton
                    animate={{ rotate: childExpanded ? 0 : -90 }}
                    transition={{
                      type: 'keyframes',
                      duration: 0.1,
                    }}
                    variant="ghost"
                    size="icon-sm"
                    className="size-4"
                    onClick={toggleExpanded}
                  >
                    <ChevronDownIcon />
                  </MotionButton>
                )}
              </motion.div>
            )}
          </AnimatePresence>
          <span className="flex items-center justify-center size-4">
            <span className="h-1.25 w-1.25 rounded-full bg-foreground" />
          </span>
        </span>

        <span className={`absolute top-[0.5lh] w-px bg-border ${hasIndentBelow ? 'bottom-0' : 'bottom-2'}`} />
      </span>
      <IndentChildCollapseContext value={childCollapsed}>
        {props.children}
      </IndentChildCollapseContext>
    </motion.div>
  )
}
