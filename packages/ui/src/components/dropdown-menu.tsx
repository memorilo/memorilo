import type * as stylex from '@stylexjs/stylex'
import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode, Ref } from 'react'
import * as stylexRuntime from '@stylexjs/stylex'
import { createContext, use, useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useControllableState } from '../hooks/use-controllable-state'
import { menuStyles } from './menu.stylex'
import { Slot } from './slot'

type MenuAlign = 'center' | 'end' | 'start'
type MenuSide = 'bottom' | 'top'

interface DropdownMenuContextValue {
  close: (restoreFocus?: boolean) => void
  contentId: string
  contentRef: { current: HTMLElement | null }
  open: boolean
  setOpen: (open: boolean) => void
  triggerId: string
  triggerRef: { current: HTMLElement | null }
}

const DropdownMenuContext = createContext<DropdownMenuContextValue | null>(null)

function useDropdownMenu(): DropdownMenuContextValue {
  const context = use(DropdownMenuContext)
  if (context === null)
    throw new Error('DropdownMenu compound components must be rendered inside DropdownMenu.Root')
  return context
}

function assignRef<T>(ref: Ref<T> | undefined, value: T | null) {
  if (typeof ref === 'function')
    ref(value)
  else if (ref)
    ref.current = value
}

function DropdownMenuRoot({ children, defaultOpen = false, onOpenChange, open }: {
  children?: ReactNode
  defaultOpen?: boolean
  onOpenChange?: (open: boolean) => void
  open?: boolean
}) {
  const [currentOpen, setOpen] = useControllableState({ defaultValue: defaultOpen, onValueChange: onOpenChange, value: open })
  const triggerRef = useRef<HTMLElement | null>(null)
  const contentRef = useRef<HTMLElement | null>(null)
  const id = useId()
  const close = useCallback((restoreFocus = true) => {
    setOpen(false)
    if (restoreFocus)
      queueMicrotask(() => triggerRef.current?.focus())
  }, [setOpen])
  const context = useMemo<DropdownMenuContextValue>(() => ({
    close,
    contentId: `${id}-content`,
    contentRef,
    open: currentOpen,
    setOpen,
    triggerId: `${id}-trigger`,
    triggerRef,
  }), [close, currentOpen, id, setOpen])

  useEffect(() => {
    if (!currentOpen)
      return
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target
      if (!(target instanceof Node))
        return
      if (!contentRef.current?.contains(target) && !triggerRef.current?.contains(target))
        close(false)
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.defaultPrevented) {
        event.preventDefault()
        close()
      }
    }
    document.addEventListener('pointerdown', handlePointerDown, true)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [close, currentOpen])

  return <DropdownMenuContext value={context}>{children}</DropdownMenuContext>
}

function DropdownMenuTrigger({ asChild = false, children, ...props }: Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className' | 'style'> & { asChild?: boolean, children?: ReactNode }) {
  const context = useDropdownMenu()
  const triggerProps = {
    ...props,
    'aria-controls': context.contentId,
    'aria-expanded': context.open,
    'aria-haspopup': 'menu' as const,
    'data-state': context.open ? 'open' : 'closed',
    'id': props.id ?? context.triggerId,
    'onClick': (event: React.MouseEvent<HTMLButtonElement>) => {
      props.onClick?.(event)
      if (!event.defaultPrevented)
        context.setOpen(!context.open)
    },
    'onKeyDown': (event: React.KeyboardEvent<HTMLButtonElement>) => {
      props.onKeyDown?.(event)
      if (!event.defaultPrevented && ['ArrowDown', 'Enter', ' '].includes(event.key)) {
        event.preventDefault()
        context.setOpen(true)
      }
    },
    'ref': (element: HTMLButtonElement | null) => {
      context.triggerRef.current = element
    },
    'type': 'button' as const,
  }
  if (asChild)
    return <Slot {...triggerProps}>{children}</Slot>
  return <button {...triggerProps} type="button">{children}</button>
}

function DropdownMenuPortal({ children, forceMount = false }: { children?: ReactNode, forceMount?: boolean }) {
  const context = useDropdownMenu()
  if (!context.open && !forceMount)
    return null
  if (typeof document === 'undefined')
    return <>{children}</>
  return createPortal(children, document.body)
}

interface DropdownMenuContentProps extends Omit<HTMLAttributes<HTMLElement>, 'className' | 'style'> {
  align?: MenuAlign
  asChild?: boolean
  forceMount?: boolean
  ref?: Ref<HTMLElement>
  side?: MenuSide
  sideOffset?: number
  variant?: 'context' | 'default' | 'editor' | 'note'
  xstyle?: stylex.StyleXStyles
}

function menuItems(content: HTMLElement): HTMLElement[] {
  return [...content.querySelectorAll<HTMLElement>('[role="menuitem"]:not([aria-disabled="true"]), [role="menuitemradio"]:not([aria-disabled="true"]), [role="menuitemcheckbox"]:not([aria-disabled="true"])')]
}

function DropdownMenuContent({ align = 'start', asChild = false, children, forceMount = false, ref, side = 'bottom', sideOffset = 6, variant = 'default', xstyle, ...props }: DropdownMenuContentProps) {
  const context = useDropdownMenu()
  const [position, setPosition] = useState<{ left: number, top: number } | null>(null)
  const setContent = useCallback((element: HTMLElement | null) => {
    context.contentRef.current = element
    assignRef(ref, element)
  }, [context.contentRef, ref])

  useLayoutEffect(() => {
    if (!context.open)
      return
    const updatePosition = () => {
      const trigger = context.triggerRef.current
      const content = context.contentRef.current
      if (!trigger || !content)
        return
      const triggerRect = trigger.getBoundingClientRect()
      const contentRect = content.getBoundingClientRect()
      const top = side === 'bottom' ? triggerRect.bottom + sideOffset : triggerRect.top - contentRect.height - sideOffset
      const rawLeft = align === 'start'
        ? triggerRect.left
        : align === 'end'
          ? triggerRect.right - contentRect.width
          : triggerRect.left + (triggerRect.width - contentRect.width) / 2
      setPosition({
        left: Math.max(8, Math.min(rawLeft, window.innerWidth - contentRect.width - 8)),
        top: Math.max(8, Math.min(top, window.innerHeight - contentRect.height - 8)),
      })
    }
    updatePosition()
    window.addEventListener('resize', updatePosition)
    document.addEventListener('scroll', updatePosition, true)
    return () => {
      window.removeEventListener('resize', updatePosition)
      document.removeEventListener('scroll', updatePosition, true)
    }
  }, [align, context.contentRef, context.open, context.triggerRef, side, sideOffset])

  useLayoutEffect(() => {
    if (!context.open)
      return
    const content = context.contentRef.current
    queueMicrotask(() => {
      if (!content?.isConnected || context.contentRef.current !== content)
        return
      const selected = content.querySelector<HTMLElement>('[role="menuitemradio"][aria-checked="true"]')
      const first = menuItems(content)[0]
      const initialItem = selected ?? first
      initialItem?.focus()
    })
  }, [context.contentRef, context.open])

  if (!context.open && !forceMount)
    return null
  const contentProps = {
    ...props,
    'aria-labelledby': props['aria-labelledby'] ?? (props['aria-label'] ? undefined : context.triggerId),
    'data-state': context.open ? 'open' : 'closed',
    'data-ui': 'dropdown-menu-content',
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
      else if (event.key === 'Tab') {
        context.close(false)
      }
    },
    'ref': setContent,
    'role': 'menu' as const,
    'style': {
      left: position?.left ?? 0,
      top: position?.top ?? 0,
      visibility: position ? 'visible' as const : 'hidden' as const,
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
    ? <Slot {...contentProps} {...styles}>{children}</Slot>
    : <div {...contentProps} {...styles}>{children}</div>
}

interface DropdownMenuItemProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className' | 'style'> {
  asChild?: boolean
  onSelect?: (event: React.MouseEvent<HTMLButtonElement>) => void
  xstyle?: stylex.StyleXStyles
}

function DropdownMenuItem({ asChild = false, children, disabled = false, onSelect, xstyle, ...props }: DropdownMenuItemProps) {
  const context = useDropdownMenu()
  const itemProps = {
    ...props,
    'aria-disabled': disabled || undefined,
    'data-ui': 'dropdown-menu-item',
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
    ? <Slot {...itemProps} {...styles}>{children}</Slot>
    : <button {...itemProps} {...styles} type="button">{children}</button>
}

const MenuRadioGroupContext = createContext<{ onValueChange: (value: string) => void, value: string } | null>(null)

function DropdownMenuRadioGroup({ children, onValueChange, value }: { children?: ReactNode, onValueChange: (value: string) => void, value: string }) {
  const context = useMemo(() => ({ onValueChange, value }), [onValueChange, value])
  return <MenuRadioGroupContext value={context}>{children}</MenuRadioGroupContext>
}

function DropdownMenuRadioItem({ value, ...props }: Omit<DropdownMenuItemProps, 'role'> & { value: string }) {
  const group = use(MenuRadioGroupContext)
  if (group === null)
    throw new Error('DropdownMenu.RadioItem must be rendered inside DropdownMenu.RadioGroup')
  const checked = group.value === value
  return (
    <DropdownMenuItem
      {...props}
      aria-checked={checked}
      data-state={checked ? 'checked' : 'unchecked'}
      role="menuitemradio"
      onSelect={(event) => {
        props.onSelect?.(event)
        if (!event.defaultPrevented)
          group.onValueChange(value)
      }}
    />
  )
}

function DropdownMenuSeparator({ xstyle, ...props }: Omit<HTMLAttributes<HTMLDivElement>, 'className' | 'style'> & { xstyle?: stylex.StyleXStyles }) {
  useDropdownMenu()
  return <div {...props} {...stylexRuntime.props(menuStyles.separator, xstyle)} data-ui="dropdown-menu-separator" role="separator" />
}

export const DropdownMenu = {
  Content: DropdownMenuContent,
  Item: DropdownMenuItem,
  Portal: DropdownMenuPortal,
  RadioGroup: DropdownMenuRadioGroup,
  RadioItem: DropdownMenuRadioItem,
  Root: DropdownMenuRoot,
  Separator: DropdownMenuSeparator,
  Trigger: DropdownMenuTrigger,
}
