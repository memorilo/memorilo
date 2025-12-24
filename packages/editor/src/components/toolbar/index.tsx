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

    let domRange: globalThis.Range
    try {
      domRange = ReactEditor.toDOMRange(editor, selection)
    }
    catch {
      setShowToolbar(false)
      return
    }

    let rect: DOMRect | undefined
    const clientRect = domRange.getClientRects()[0]
    if (clientRect) {
      rect = clientRect
    }
    else {
      const boundingRect = domRange.getBoundingClientRect()
      if (boundingRect && (boundingRect.width !== 0 || boundingRect.height !== 0)) {
        rect = boundingRect
      }
    }

    if (!rect) {
      setShowToolbar(false)
      return
    }

    toolbar.style.top = `${Math.max(10, rect.top + window.pageYOffset - 48)}px`
    toolbar.style.left = `${Math.max(96, rect.left + window.scrollX - 96)}px`

    setShowToolbar(true)
  }, [editor, selection, isFocused, setShowToolbar])

  return (
    <aside
      ref={ref}
      className={cn(
        'absolute z-50 flex items-center space-x-1 rounded-lg border border-gray-300 bg-white px-3 py-1 shadow-[0_0_30px_0px_rgba(0,0,0,0.3)] transition-opacity duration-300',
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
