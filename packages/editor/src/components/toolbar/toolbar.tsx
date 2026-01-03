import type { VirtualElement } from '@floating-ui/react'
import type { MouseEvent, PropsWithChildren } from 'react'
import type { Editor } from 'slate'
import { autoUpdate, flip, inline, offset, shift, useFloating } from '@floating-ui/react'
import { useIsMobile } from '@memorilo/components/hooks/use-mobile'
import { cn } from '@memorilo/utils'
import { Option, pipe } from 'effect'
import { attempt } from 'es-toolkit'
import { createContext, use, useLayoutEffect, useMemo, useState } from 'react'
import { Range as SlateRange } from 'slate'
import { ReactEditor, useFocused, useSlate, useSlateSelection } from 'slate-react'

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
const VIEWPORT_PADDING = 8
const DESKTOP_OFFSET = 8
const MOBILE_OFFSET = 12

const isUsableRect = (rect: DOMRect) => rect.width !== 0 || rect.height !== 0

function attemptOption<T,>(action: () => T) {
  return pipe(
    attempt(action),
    ([error, result]) => (error ? Option.none() : Option.fromNullable(result)),
  )
}

function createVirtualElement(getRect: () => DOMRect, getRects: () => Array<DOMRect> = () => [getRect()], contextElement?: Element): VirtualElement {
  return {
    getBoundingClientRect: getRect,
    getClientRects: getRects,
    contextElement,
  }
}

function getSelectionRange(editor: Editor, selection: SlateRange) {
  return attemptOption(() => ReactEditor.toDOMRange(editor, selection))
}

function getContextElement(editor: Editor, range: Range) {
  const container = range.commonAncestorContainer
  const element = container instanceof Element ? container : container.parentElement
  return pipe(
    Option.fromNullable(element),
    Option.orElse(() => attemptOption(() => ReactEditor.toDOMNode(editor, editor))),
    Option.getOrUndefined,
  )
}

function createViewportReference(): VirtualElement {
  return createVirtualElement(
    () =>
      new DOMRect(
        Math.max(0, window.innerWidth - VIEWPORT_PADDING),
        Math.max(0, window.innerHeight - VIEWPORT_PADDING),
        0,
        0,
      ),
    undefined,
    document.body,
  )
}

function createSelectionReference(editor: Editor, selection: SlateRange) {
  return pipe(
    getSelectionRange(editor, selection),
    Option.flatMap((initialRange) => {
      const contextElement = getContextElement(editor, initialRange)
      const getRange = () => pipe(
        getSelectionRange(editor, selection),
        Option.getOrElse(() => initialRange),
      )
      const getRect = () => getRange().getBoundingClientRect()
      const initialRect = getRect()
      if (!isUsableRect(initialRect))
        return Option.none()

      const getRects = () => {
        const rects = Array.from(getRange().getClientRects())
        if (rects.length > 0)
          return rects
        const fallback = getRect()
        return isUsableRect(fallback) ? [fallback] : []
      }

      return Option.some(createVirtualElement(getRect, getRects, contextElement))
    }),
  )
}

export function Toolbar({ children }: PropsWithChildren) {
  const { isShowToolbar, setShowToolbar } = useToolbarShow()
  const isMobile = useIsMobile()
  const editor = useSlate()
  const selection = useSlateSelection()
  const isFocused = useFocused()

  const placement = isMobile ? 'top-end' : 'bottom-start'
  const middleware = useMemo(() => {
    const base = [
      inline(),
      offset(isMobile ? MOBILE_OFFSET : DESKTOP_OFFSET),
    ]
    const shiftMiddleware = shift({ padding: VIEWPORT_PADDING, crossAxis: true })
    return isMobile
      ? [...base, shiftMiddleware]
      : [...base, flip({ padding: VIEWPORT_PADDING }), shiftMiddleware]
  }, [isMobile])

  const { refs, floatingStyles, update, y, strategy } = useFloating({
    placement,
    strategy: 'fixed',
    middleware,
    whileElementsMounted: autoUpdate,
  })
  const resolvedFloatingStyles = isMobile
    ? {
        position: strategy,
        top: y ?? 0,
        right: VIEWPORT_PADDING,
        left: 'auto',
        transform: 'none',
      }
    : floatingStyles

  useLayoutEffect(() => {
    const reference = pipe(
      Option.fromNullable(selection),
      Option.filter(SlateRange.isExpanded),
      Option.filter(() => isFocused),
      Option.flatMap(nextSelection =>
        isMobile
          ? Option.some(createViewportReference())
          : createSelectionReference(editor, nextSelection),
      ),
    )

    pipe(
      reference,
      Option.match({
        onNone: () => {
          setShowToolbar(false)
        },
        onSome: (nextReference) => {
          refs.setReference(nextReference)
          update()
          setShowToolbar(true)
        },
      }),
    )
  }, [editor, isFocused, isMobile, refs, selection, setShowToolbar, update])

  return (
    <aside
      ref={refs.setFloating}
      className={cn(
        'fixed z-50 flex max-w-[calc(100vw-16px)] flex-col items-stretch gap-1 overflow-hidden rounded-lg border border-gray-300 bg-white px-1 py-1 shadow-[0_0_30px_0px_rgba(0,0,0,0.3)] transition-opacity duration-300',
        isShowToolbar ? 'opacity-100' : 'opacity-0 pointer-events-none',
      )}
      style={resolvedFloatingStyles}
      onMouseDown={(e: MouseEvent) => {
        e.preventDefault()
      }}
    >
      {children}
    </aside>
  )
}

export function ToolbarRow({ children, className }: PropsWithChildren<{ className?: string }>) {
  return (
    <div className={cn('flex w-full min-w-0 items-center gap-1 overflow-x-auto', className)}>
      {children}
    </div>
  )
}
