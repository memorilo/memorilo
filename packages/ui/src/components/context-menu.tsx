import type * as stylex from '@stylexjs/stylex'
import type { ButtonHTMLAttributes, HTMLAttributes, ReactElement, ReactNode, Ref } from 'react'
import * as stylexRuntime from '@stylexjs/stylex'
import { Children, createContext, use, useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useControllableState } from '../hooks/use-controllable-state'
import { menuStyles } from './menu.stylex'
import { Slot } from './slot'

export interface ContextMenuPoint {
  x: number
  y: number
}

interface ContextMenuContextValue {
  close: (restoreFocus?: boolean) => void
  contentId: string
  contentRef: { current: HTMLElement | null }
  open: boolean
  openAt: (point: ContextMenuPoint) => void
  position: ContextMenuPoint | null
  setOpen: (open: boolean) => void
  triggerId: string
  triggerRef: { current: HTMLElement | null }
}

const ContextMenuContext = createContext<ContextMenuContextValue | null>(null)

function useContextMenu(): ContextMenuContextValue {
  const context = use(ContextMenuContext)
  if (context === null)
    throw new Error('ContextMenu compound components must be rendered inside ContextMenu.Root')
  return context
}

function assignRef<T>(ref: Ref<T> | undefined, value: T | null) {
  if (typeof ref === 'function')
    ref(value)
  else if (ref)
    ref.current = value
}

export interface ContextMenuRootProps {
  children?: ReactNode
  defaultOpen?: boolean
  defaultPosition?: ContextMenuPoint | null
  onEscapeKeyDown?: (event: KeyboardEvent) => void
  onOpenChange?: (open: boolean) => void
  onPointerDownOutside?: (event: PointerEvent) => void
  onPositionChange?: (position: ContextMenuPoint) => void
  open?: boolean
  position?: ContextMenuPoint | null
}

function ContextMenuRoot({
  children,
  defaultOpen = false,
  defaultPosition = null,
  onEscapeKeyDown,
  onOpenChange,
  onPointerDownOutside,
  onPositionChange,
  open,
  position,
}: ContextMenuRootProps) {
  const [currentOpen, setOpen] = useControllableState({ defaultValue: defaultOpen, onValueChange: onOpenChange, value: open })
  const [uncontrolledPosition, setUncontrolledPosition] = useState<ContextMenuPoint | null>(defaultPosition)
  const triggerRef = useRef<HTMLElement | null>(null)
  const contentRef = useRef<HTMLElement | null>(null)
  const id = useId()
  const currentPosition = position === undefined ? uncontrolledPosition : position
  const openAt = useCallback((nextPosition: ContextMenuPoint) => {
    setUncontrolledPosition(nextPosition)
    onPositionChange?.(nextPosition)
    setOpen(true)
  }, [onPositionChange, setOpen])
  const close = useCallback((restoreFocus = false) => {
    setOpen(false)
    if (restoreFocus)
      queueMicrotask(() => triggerRef.current?.focus())
  }, [setOpen])
  const context = useMemo<ContextMenuContextValue>(() => ({
    close,
    contentId: `${id}-content`,
    contentRef,
    open: currentOpen,
    openAt,
    position: currentPosition,
    setOpen,
    triggerId: `${id}-trigger`,
    triggerRef,
  }), [close, currentOpen, currentPosition, id, openAt, setOpen])

  useEffect(() => {
    if (!currentOpen)
      return
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target
      if (!(target instanceof Node))
        return
      if (!contentRef.current?.contains(target) && !triggerRef.current?.contains(target)) {
        onPointerDownOutside?.(event)
        if (!event.defaultPrevented)
          close(false)
      }
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.defaultPrevented) {
        onEscapeKeyDown?.(event)
        if (event.defaultPrevented)
          return
        event.preventDefault()
        close()
      }
      else if (event.key === 'Tab') {
        close(false)
      }
    }
    const handleViewportChange = () => close(false)
    document.addEventListener('pointerdown', handlePointerDown, true)
    document.addEventListener('keydown', handleKeyDown)
    window.addEventListener('resize', handleViewportChange)
    document.addEventListener('scroll', handleViewportChange, true)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true)
      document.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('resize', handleViewportChange)
      document.removeEventListener('scroll', handleViewportChange, true)
    }
  }, [close, currentOpen, onEscapeKeyDown, onPointerDownOutside])

  return <ContextMenuContext value={context}>{children}</ContextMenuContext>
}

function ContextMenuTrigger({ asChild = false, children, ...props }: Omit<HTMLAttributes<HTMLElement>, 'className' | 'style'> & {
  asChild?: boolean
  children?: ReactNode
}) {
  const context = useContextMenu()
  const triggerProps = {
    ...props,
    'aria-controls': context.contentId,
    'aria-expanded': context.open,
    'aria-haspopup': 'menu' as const,
    'data-state': context.open ? 'open' : 'closed',
    'id': props.id ?? context.triggerId,
    'onContextMenu': (event: React.MouseEvent<HTMLElement>) => {
      props.onContextMenu?.(event)
      if (event.defaultPrevented)
        return
      event.preventDefault()
      context.openAt({ x: event.clientX, y: event.clientY })
    },
    'ref': (element: HTMLElement | null) => {
      context.triggerRef.current = element
    },
  }
  if (asChild)
    return <Slot {...triggerProps}>{Children.only(children) as ReactElement}</Slot>
  return <div {...triggerProps}>{children}</div>
}

function menuItems(content: HTMLElement): HTMLElement[] {
  return [...content.querySelectorAll<HTMLElement>('[role="menuitem"]:not([aria-disabled="true"]), [role="menuitemradio"]:not([aria-disabled="true"]), [role="menuitemcheckbox"]:not([aria-disabled="true"])')]
}

interface ContextMenuContentProps extends Omit<HTMLAttributes<HTMLElement>, 'className' | 'style'> {
  asChild?: boolean
  forceMount?: boolean
  position?: ContextMenuPoint
  ref?: Ref<HTMLElement>
  variant?: 'context' | 'default' | 'editor' | 'note'
  xstyle?: stylex.StyleXStyles
}

function ContextMenuContent({
  asChild = false,
  children,
  forceMount = false,
  position,
  ref,
  variant = 'context',
  xstyle,
  ...props
}: ContextMenuContentProps) {
  const context = useContextMenu()
  const [measuredPosition, setMeasuredPosition] = useState<ContextMenuPoint | null>(null)
  const setContent = useCallback((element: HTMLElement | null) => {
    context.contentRef.current = element
    assignRef(ref, element)
  }, [context.contentRef, ref])
  const targetPosition = position ?? context.position

  useLayoutEffect(() => {
    if (!context.open || !targetPosition)
      return
    const content = context.contentRef.current
    if (!content)
      return
    const edge = 8
    const rect = content.getBoundingClientRect()
    setMeasuredPosition({
      x: Math.max(edge, Math.min(targetPosition.x, window.innerWidth - rect.width - edge)),
      y: Math.max(edge, Math.min(targetPosition.y, window.innerHeight - rect.height - edge)),
    })
  }, [context.contentRef, context.open, targetPosition])

  useLayoutEffect(() => {
    if (!context.open)
      return
    const content = context.contentRef.current
    const first = content ? menuItems(content)[0] : undefined
    first?.focus()
  }, [context.contentRef, context.open])

  if (!context.open && !forceMount)
    return null
  const nextPosition = measuredPosition ?? targetPosition
  const contentProps = {
    ...props,
    'aria-labelledby': props['aria-labelledby'] ?? (props['aria-label'] ? undefined : context.triggerRef.current ? context.triggerId : undefined),
    'data-state': context.open ? 'open' : 'closed',
    'data-ui': 'context-menu-content',
    'data-variant': variant,
    'id': props.id ?? context.contentId,
    'onKeyDown': (event: React.KeyboardEvent<HTMLElement>) => {
      props.onKeyDown?.(event)
      if (event.defaultPrevented)
        return
      const items = menuItems(event.currentTarget)
      const currentIndex = items.findIndex(item => item === document.activeElement)
      if (['ArrowDown', 'ArrowUp', 'End', 'Home'].includes(event.key)) {
        event.preventDefault()
        const targetIndex = event.key === 'Home'
          ? 0
          : event.key === 'End'
            ? items.length - 1
            : (Math.max(0, currentIndex) + (event.key === 'ArrowUp' ? -1 : 1) + items.length) % items.length
        items[targetIndex]?.focus()
      }
      else if ((event.key === 'Enter' || event.key === ' ') && document.activeElement instanceof HTMLButtonElement) {
        event.preventDefault()
        document.activeElement.click()
      }
    },
    'ref': setContent,
    'role': 'menu' as const,
    'style': {
      left: nextPosition?.x ?? 0,
      top: nextPosition?.y ?? 0,
      visibility: nextPosition ? 'visible' as const : 'hidden' as const,
    },
    'tabIndex': -1,
  }
  const variantStyle = variant === 'context'
    ? menuStyles.contextContent
    : variant === 'editor'
      ? menuStyles.editorContent
      : variant === 'note'
        ? menuStyles.noteContent
        : menuStyles.defaultContent
  const styles = stylexRuntime.props(menuStyles.content, variantStyle, xstyle)
  return asChild
    ? <Slot {...contentProps} {...styles}>{Children.only(children) as ReactElement}</Slot>
    : <div {...contentProps} {...styles}>{children}</div>
}

interface ContextMenuItemProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className' | 'style'> {
  asChild?: boolean
  onSelect?: (event: React.MouseEvent<HTMLButtonElement>) => void
  xstyle?: stylex.StyleXStyles
}

function ContextMenuItem({ asChild = false, children, disabled = false, onSelect, xstyle, ...props }: ContextMenuItemProps) {
  const context = useContextMenu()
  const itemProps = {
    ...props,
    'aria-disabled': disabled || undefined,
    'data-ui': 'context-menu-item',
    'disabled': disabled,
    'onClick': (event: React.MouseEvent<HTMLButtonElement>) => {
      props.onClick?.(event)
      if (!event.defaultPrevented)
        onSelect?.(event)
      if (!event.defaultPrevented)
        context.close()
    },
    'role': props.role ?? 'menuitem',
    'tabIndex': -1,
    'type': 'button' as const,
  }
  const styles = stylexRuntime.props(menuStyles.item, xstyle)
  return asChild
    ? <Slot {...itemProps} {...styles}>{Children.only(children) as ReactElement}</Slot>
    : <button {...itemProps} {...styles}>{children}</button>
}

function ContextMenuPortal({ children, forceMount = false }: { children?: ReactNode, forceMount?: boolean }) {
  const context = useContextMenu()
  if (!context.open && !forceMount)
    return null
  if (typeof document === 'undefined')
    return <>{children}</>
  return createPortal(children, document.body)
}

export const ContextMenu = {
  Content: ContextMenuContent,
  Item: ContextMenuItem,
  Portal: ContextMenuPortal,
  Root: ContextMenuRoot,
  Trigger: ContextMenuTrigger,
}
