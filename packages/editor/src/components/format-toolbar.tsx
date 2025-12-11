import type { PropsWithChildren } from 'react'
import type { MemoriloElementStrings, MemoriloMarkupStrings } from '../slate'
import { cn } from '@memorilo/utils'
import { createContext, use, useEffect, useMemo, useRef, useState } from 'react'
import { Editor, Range } from 'slate'
import { useFocused, useSlate, useSlateSelection } from 'slate-react'
import { ELEMENTS } from './elements'
import FormatButton from './format-button'
import { MARKUPS } from './markups'

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

    if (
      !selection
      || !isFocused
      || Range.isCollapsed(selection)
      || Editor.string(editor, selection) === ''
    ) {
      setShowToolbar(false)
      return
    }

    const domSelection = window.getSelection()
    if (!domSelection) {
      setShowToolbar(false)
      return
    }

    const domRange = domSelection.getRangeAt(0)
    const rect = domRange.getClientRects()

    if (rect[0] == null)
      return

    toolbar.style.top = `${Math.max(10, rect[0].top + window.pageYOffset - 48)}px`
    toolbar.style.left = `${Math.max(96, rect[0].left + window.scrollX - 96)}px`

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
      {/* Markup buttons (bold, italic, etc) */}
      {Object.entries(MARKUPS).map(([name, value]) => {
        return (
          <FormatButton
            key={name}
            symbol={value.symbol}
            markup={name as MemoriloMarkupStrings}
          />
        )
      })}

      {/* Elements button */}
      {Object.entries(ELEMENTS).filter(([name]) => name !== 'plain').map(([name, value]) => {
        return (
          <FormatButton
            key={name}
            symbol={value.symbol}
            element={name as MemoriloElementStrings}
          />
        )
      })}
    </aside>
  )
}
