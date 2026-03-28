import type { Editor } from '@tiptap/core'
import type { EditorState } from '@tiptap/pm/state'
import { cn } from '@memorilo/utils'
import { CellSelection } from '@tiptap/pm/tables'
import { BubbleMenu } from '@tiptap/react/menus'
import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react'
import { useTranslation } from 'react-i18next'
import { BubbleMenuButton } from './bubble-menu-button'
import { bubbleMenuItems } from './bubble-menu-items'
import { HeadingSelect } from './heading-select'
import { HighlightMenu } from './highlight-menu'
import { TableMenu } from './table-menu'
import { useEditorSelectionUpdate } from './use-editor-selection-update'

interface EditorBubbleMenuProps {
  editor: Editor
}

const bubbleMenuViewportPadding = 12
const bubbleMenuCompactBreakpoint = 340
const bubbleMenuViewportBoundaryBreakpoint = 480

function isSelectionInTable(state: EditorState) {
  const { $from } = state.selection
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const node = $from.node(depth)
    if (node.type.spec.tableRole) {
      return true
    }
  }
  return false
}

function shouldShowBubbleMenu(editor: Editor, state: EditorState) {
  const { selection } = state
  const isInTable = isSelectionInTable(state)
  const isCellSelection = selection instanceof CellSelection
  const hasRangeSelection = selection.from !== selection.to
  if (isInTable) {
    return hasRangeSelection || isCellSelection || editor.can().splitCell()
  }
  return hasRangeSelection
}

function isVisibleFixedChrome(element: HTMLElement) {
  const style = window.getComputedStyle(element)
  if (style.position !== 'fixed' || style.display === 'none' || style.visibility === 'hidden') {
    return false
  }

  const rect = element.getBoundingClientRect()
  return rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.top < window.innerHeight
}

function getBubbleChromeBounds(floatingElement: HTMLElement) {
  let left = 0
  let right = window.innerWidth

  for (const element of document.querySelectorAll<HTMLElement>('[data-slot="sidebar-container"]')) {
    if (!isVisibleFixedChrome(element)) {
      continue
    }

    if (element === floatingElement || element.contains(floatingElement) || floatingElement.contains(element)) {
      continue
    }

    const rect = element.getBoundingClientRect()
    if (rect.left <= bubbleMenuViewportPadding) {
      left = Math.max(left, rect.right)
    }
    if (rect.right >= window.innerWidth - bubbleMenuViewportPadding) {
      right = Math.min(right, rect.left)
    }
  }

  return { left, right }
}

function getBubbleBoundaryElement(editor: Editor) {
  if (!editor.isInitialized) {
    return null
  }

  const editorElement = editor.options.element
  if (!(editorElement instanceof HTMLElement)) {
    return null
  }

  if (!editorElement.isConnected) {
    return null
  }

  const boundary = editorElement.closest('.memorilo-editor')
  if (boundary instanceof HTMLElement) {
    return boundary
  }

  // Some fixtures and embedded editor surfaces render the editable node without
  // the outer `.memorilo-editor` shell. In that case, keep the bubble menu
  // bounded to the editor DOM itself instead of crashing the entire surface.
  return editorElement
}

function getBubbleBoundaryRect(editor: Editor, floatingElement: HTMLElement) {
  const boundary = getBubbleBoundaryElement(editor)

  const boundaryRect = boundary?.getBoundingClientRect()
  const chromeBounds = getBubbleChromeBounds(floatingElement)
  const hasMeasuredBoundary = boundaryRect !== undefined
    && boundaryRect.width > 0
    && boundaryRect.height > 0
  const left = window.innerWidth <= bubbleMenuViewportBoundaryBreakpoint
    || !hasMeasuredBoundary
    ? chromeBounds.left
    : Math.max(boundaryRect.left, chromeBounds.left)
  const right = window.innerWidth <= bubbleMenuViewportBoundaryBreakpoint
    || !hasMeasuredBoundary
    ? chromeBounds.right
    : Math.min(boundaryRect.right, chromeBounds.right)

  if (right <= left) {
    return {
      x: 0,
      y: 0,
      width: window.innerWidth,
      height: window.innerHeight,
    }
  }

  return {
    x: left,
    y: 0,
    width: right - left,
    height: window.innerHeight,
  }
}

function getBubbleAvailableWidth(editor: Editor, floatingElement: HTMLElement) {
  const boundary = getBubbleBoundaryRect(editor, floatingElement)
  const availableWidth = boundary.width - bubbleMenuViewportPadding * 2
  if (availableWidth <= 0) {
    throw new Error(`Bubble menu boundary is too narrow: ${boundary.width}px`)
  }

  return availableWidth
}

function getBubbleBoundaryConfig(editor: Editor, floatingElement: HTMLElement) {
  const boundary = getBubbleBoundaryRect(editor, floatingElement)
  return {
    boundary,
    maxWidth: getBubbleAvailableWidth(editor, floatingElement),
    padding: bubbleMenuViewportPadding,
  }
}

function createCompactModeStore() {
  let compact = false
  const listeners = new Set<() => void>()

  return {
    getSnapshot() {
      return compact
    },
    setSnapshot(nextCompact: boolean) {
      if (compact === nextCompact) {
        return
      }

      compact = nextCompact
      listeners.forEach(listener => listener())
    },
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}

export function EditorBubbleMenu({ editor }: EditorBubbleMenuProps) {
  const { t } = useTranslation('app')
  const translate = (key: string) => t(key as never) as string
  const bubbleMenuRef = useRef<HTMLDivElement | null>(null)
  const compactModeStoreRef = useRef(createCompactModeStore())
  const isCompact = useSyncExternalStore(
    compactModeStoreRef.current.subscribe,
    compactModeStoreRef.current.getSnapshot,
  )
  const refreshCompactMode = useCallback((floatingElement: HTMLDivElement) => {
    compactModeStoreRef.current.setSnapshot(
      getBubbleAvailableWidth(editor, floatingElement) <= bubbleMenuCompactBreakpoint,
    )
  }, [editor])
  useEditorSelectionUpdate(editor)
  const showMenu = shouldShowBubbleMenu(editor, editor.state)
  const isTableSelection = isSelectionInTable(editor.state)

  useEffect(() => {
    const floatingElement = bubbleMenuRef.current
    if (!floatingElement) {
      return
    }

    const refresh = () => {
      refreshCompactMode(floatingElement)
    }

    refresh()
    window.addEventListener('resize', refresh)

    if (typeof ResizeObserver === 'undefined') {
      return () => {
        window.removeEventListener('resize', refresh)
      }
    }

    const boundaryElement = getBubbleBoundaryElement(editor)
    if (!boundaryElement) {
      return () => {
        window.removeEventListener('resize', refresh)
      }
    }

    const observer = new ResizeObserver(refresh)
    observer.observe(boundaryElement)
    return () => {
      window.removeEventListener('resize', refresh)
      observer.disconnect()
    }
  }, [editor, refreshCompactMode, showMenu])

  return (
    <BubbleMenu
      ref={(element) => {
        bubbleMenuRef.current = element
      }}
      editor={editor}
      appendTo={() => document.body}
      options={{
        strategy: 'fixed',
        placement: 'top',
        offset: 16,
        flip: ({ elements }) => getBubbleBoundaryConfig(editor, elements.floating),
        shift: ({ elements }) => ({
          crossAxis: true,
          ...getBubbleBoundaryConfig(editor, elements.floating),
        }),
        size: ({ elements }) => {
          const config = getBubbleBoundaryConfig(editor, elements.floating)
          return {
            ...config,
            apply({ elements }) {
              elements.floating.style.maxWidth = `${config.maxWidth}px`
            },
          }
        },
      }}
      className={cn(
        'overflow-hidden border border-border/70 bg-popover/95 text-popover-foreground shadow-lg backdrop-blur-sm',
        isCompact ? 'rounded-lg px-1.5 py-1' : 'rounded-xl px-2 py-1.5',
      )}
      shouldShow={({ editor: currentEditor, state }) =>
        currentEditor.isEditable && shouldShowBubbleMenu(currentEditor, state)}
    >
      <div className="w-full overflow-hidden" data-testid="bubble-menu">
        <div
          className={cn(
            'flex w-full flex-col',
            isCompact ? 'gap-0.5' : 'gap-1',
          )}
          data-testid="bubble-menu-track"
        >
          {showMenu && isTableSelection
            ? (
                <div
                  className={cn(
                    'flex items-center border-b border-border/70',
                    isCompact ? 'gap-0.5 pb-0.5' : 'gap-1 pb-1',
                  )}
                >
                  <TableMenu editor={editor} />
                </div>
              )
            : null}
          {showMenu
            ? (
                <div
                  className={cn(
                    'flex items-center',
                    isCompact ? 'gap-0.5' : 'gap-1',
                  )}
                >
                  <HeadingSelect editor={editor} compact={isCompact} />
                  <div
                    className={cn(
                      'w-px shrink-0 bg-border/70',
                      isCompact ? 'mx-0.5 h-4' : 'mx-1 h-5',
                    )}
                  />
                  {bubbleMenuItems.map(item => (
                    <BubbleMenuButton
                      key={item.name}
                      label={translate(item.labelKey)}
                      active={editor.isActive(item.name)}
                      disabled={!item.isEnabled(editor)}
                      Icon={item.Icon}
                      onClick={() => item.command(editor)}
                      compact={isCompact}
                      testId={`bubble-button-${item.name}`}
                    />
                  ))}
                  <div
                    className={cn(
                      'w-px shrink-0 bg-border/70',
                      isCompact ? 'mx-0.5 h-4' : 'mx-1 h-5',
                    )}
                  />
                  <HighlightMenu editor={editor} compact={isCompact} />
                </div>
              )
            : null}
        </div>
      </div>
    </BubbleMenu>
  )
}
