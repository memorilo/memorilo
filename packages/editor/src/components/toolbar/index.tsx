import type { PropsWithChildren } from 'react'
import type { MemoriloMarkupStrings } from '../../slate'
import { Separator } from '@memorilo/components/ui/separator'
import { cn } from '@memorilo/utils'
import { createContext, use, useEffect, useMemo, useRef, useState } from 'react'
import { ReactEditor, useFocused, useSlate, useSlateSelection } from 'slate-react'
import { MARKUPS } from '../markups'
import { BlockTypeSelect } from './block-type-select'
import { LinkToggleButton } from './link-toggle-button'
import MarkupFormatButton from './markup-format-button'
import { TodoToggleButton } from './todo-toggle-button'

interface ToolbarShowContextType {
  isShowToolbar: boolean
  setShowToolbar: (show: boolean) => void
}
const ToolbarShowContext = createContext<ToolbarShowContextType | undefined>(undefined)

export function ToolbarProvider(props: PropsWithChildren) {
  const [isShowToolbar, setShowToolbar] = useState(false)

  const handle = useMemo(() => ({
    isShowToolbar,
    setShowToolbar,
  }), [isShowToolbar])

  return (
    <ToolbarShowContext value={handle}>
      {props.children}
    </ToolbarShowContext>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useToolbarShow() {
  const value = use(ToolbarShowContext)
  if (!value) {
    throw new Error('useToolbarShow must be used within a ToolbarProvider')
  }
  return value
}

export function FormatToolbar() {
  const { isShowToolbar, setShowToolbar } = useToolbarShow()

  const ref = useRef<HTMLDivElement>(null)

  const editor = useSlate()
  const selection = useSlateSelection()
  const isFocused = useFocused()

  useEffect(() => {
    const toolbar = ref.current

    if (!toolbar)
      return

    if (!selection || !isFocused) {
      setShowToolbar(false)
      return
    }

    const clamp = (value: number, min: number, max: number) => {
      if (max < min)
        return min
      return Math.min(max, Math.max(min, value))
    }

    const getSelectionRect = (): DOMRect | undefined => {
      try {
        const domRange = ReactEditor.toDOMRange(editor, selection)
        const clientRect = domRange.getClientRects()[0]
        if (clientRect)
          return clientRect

        const boundingRect = domRange.getBoundingClientRect()
        if (boundingRect && (boundingRect.width !== 0 || boundingRect.height !== 0))
          return boundingRect
      }
      catch {}

      try {
        const [node, offset] = ReactEditor.toDOMPoint(editor, selection.anchor)
        const range = document.createRange()
        range.setStart(node, offset)
        range.setEnd(node, offset)
        return range.getClientRects()[0] ?? range.getBoundingClientRect()
      }
      catch {}

      return undefined
    }

    const updatePosition = () => {
      const rect = getSelectionRect()
      if (!rect) {
        setShowToolbar(false)
        return
      }

      const VIEWPORT_MARGIN = 8
      const GAP = 8

      toolbar.style.maxWidth = `calc(100vw - ${VIEWPORT_MARGIN * 2}px)`

      const { width: toolbarWidth, height: toolbarHeight } = toolbar.getBoundingClientRect()

      const viewportWidth = window.innerWidth
      const viewportHeight = window.innerHeight

      const safeToolbarWidth = Math.min(toolbarWidth, viewportWidth - VIEWPORT_MARGIN * 2)
      const safeToolbarHeight = Math.min(toolbarHeight, viewportHeight - VIEWPORT_MARGIN * 2)

      let left = rect.left
      left = clamp(left, VIEWPORT_MARGIN, viewportWidth - safeToolbarWidth - VIEWPORT_MARGIN)

      let top = rect.bottom + GAP
      const overflowsBottom = top + safeToolbarHeight + VIEWPORT_MARGIN > viewportHeight
      if (overflowsBottom)
        top = rect.top - safeToolbarHeight - GAP
      top = clamp(top, VIEWPORT_MARGIN, viewportHeight - safeToolbarHeight - VIEWPORT_MARGIN)

      toolbar.style.left = `${left}px`
      toolbar.style.top = `${top}px`

      setShowToolbar(true)
    }

    updatePosition()
    window.addEventListener('scroll', updatePosition, true)
    window.addEventListener('resize', updatePosition)
    return () => {
      window.removeEventListener('scroll', updatePosition, true)
      window.removeEventListener('resize', updatePosition)
    }
  }, [editor, selection, isFocused, setShowToolbar])

  return (
    <aside
      ref={ref}
      className={cn(
        'fixed z-50 flex max-w-[calc(100vw-16px)] items-center space-x-1 overflow-x-auto rounded-lg border border-gray-300 bg-white px-1 py-1 shadow-[0_0_30px_0px_rgba(0,0,0,0.3)] transition-opacity duration-300',
        isShowToolbar ? 'opacity-100' : 'opacity-0 pointer-events-none',
      )}
      onMouseDown={(e: any) => {
        e.preventDefault()
      }}
    >
      <BlockTypeSelect />
      <Separator orientation="vertical" />
      <LinkToggleButton />
      <Separator orientation="vertical" />
      {/* Markup buttons (bold, italic, etc) */}
      {Object.entries(MARKUPS).map(([name, value]) => {
        return (
          <MarkupFormatButton
            key={name}
            symbol={value.symbol}
            markup={name as MemoriloMarkupStrings}
          />
        )
      })}
      <Separator orientation="vertical" />
      <TodoToggleButton />
    </aside>
  )
}
