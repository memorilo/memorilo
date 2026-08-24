import type { Placement } from '@floating-ui/react'
import type * as stylex from '@stylexjs/stylex'
import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode, Ref } from 'react'
import { autoUpdate, flip, FloatingFocusManager, FloatingPortal, offset, shift, useClick, useDismiss, useFloating, useInteractions, useMergeRefs, useRole } from '@floating-ui/react'
import * as stylexRuntime from '@stylexjs/stylex'
import { createContext, use, useCallback, useEffect, useId, useMemo, useState } from 'react'
import { useControllableState } from '../hooks/use-controllable-state'
import { popoverStyles } from './popover.stylex'
import { Slot } from './slot'
import { surfaceStyles } from './surface.stylex'

type PopoverSide = 'bottom' | 'left' | 'right' | 'top'
type PopoverAlign = 'center' | 'end' | 'start'

function toPlacement(side: PopoverSide, align: PopoverAlign): Placement {
  return align === 'center' ? side : `${side}-${align}`
}

export interface PopoverRootProps {
  children?: ReactNode
  defaultOpen?: boolean
  modal?: boolean
  onEscapeKeyDown?: (event: KeyboardEvent) => void
  onOpenChange?: (open: boolean) => void
  onPointerDownOutside?: (event: PointerEvent) => void
  open?: boolean
}

interface PopoverContextValue {
  close: () => void
  contentId: string
  floatingContext: ReturnType<typeof useFloating>['context']
  floatingStyles: React.CSSProperties
  getFloatingProps: ReturnType<typeof useInteractions>['getFloatingProps']
  getReferenceProps: ReturnType<typeof useInteractions>['getReferenceProps']
  modal: boolean
  open: boolean
  refs: ReturnType<typeof useFloating>['refs']
  setCollisionPadding: (value: number) => void
  setOpen: (open: boolean) => void
  setPlacement: (value: Placement) => void
  setSideOffset: (value: number) => void
  triggerId: string
}

const PopoverContext = createContext<PopoverContextValue | null>(null)

function usePopover(): PopoverContextValue {
  const context = use(PopoverContext)
  if (context === null)
    throw new Error('Popover compound components must be rendered inside Popover.Root')
  return context
}

function PopoverRoot({
  children,
  defaultOpen = false,
  modal = false,
  onEscapeKeyDown,
  onOpenChange,
  onPointerDownOutside,
  open,
}: PopoverRootProps) {
  const [currentOpen, setOpen] = useControllableState({ defaultValue: defaultOpen, onValueChange: onOpenChange, value: open })
  const [collisionPadding, setCollisionPadding] = useState(8)
  const [placement, setPlacement] = useState<Placement>('bottom-start')
  const [sideOffset, setSideOffset] = useState(6)
  const id = useId()
  const floating = useFloating({
    middleware: [offset(sideOffset), flip({ padding: collisionPadding }), shift({ padding: collisionPadding })],
    onOpenChange: setOpen,
    open: currentOpen,
    placement,
    whileElementsMounted: autoUpdate,
  })
  const click = useClick(floating.context, { enabled: true, toggle: true })
  const dismiss = useDismiss(floating.context, {
    escapeKey: false,
    outsidePress: (event) => {
      onPointerDownOutside?.(event as PointerEvent)
      return !event.defaultPrevented
    },
  })
  const role = useRole(floating.context, { role: 'dialog' })
  const interactions = useInteractions([click, dismiss, role])
  const close = useCallback(() => setOpen(false), [setOpen])

  useEffect(() => {
    if (!currentOpen)
      return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented)
        return
      onEscapeKeyDown?.(event)
      if (event.defaultPrevented)
        return
      event.preventDefault()
      close()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [close, currentOpen, onEscapeKeyDown])

  const context = useMemo<PopoverContextValue>(() => ({
    close,
    contentId: `${id}-content`,
    floatingContext: floating.context,
    floatingStyles: floating.floatingStyles,
    getFloatingProps: interactions.getFloatingProps,
    getReferenceProps: interactions.getReferenceProps,
    modal,
    open: currentOpen,
    refs: floating.refs,
    setCollisionPadding,
    setOpen,
    setPlacement,
    setSideOffset,
    triggerId: `${id}-trigger`,
  }), [close, currentOpen, floating.context, floating.floatingStyles, floating.refs, id, interactions.getFloatingProps, interactions.getReferenceProps, modal, setCollisionPadding, setOpen, setPlacement, setSideOffset])

  return <PopoverContext value={context}>{children}</PopoverContext>
}

interface PopoverTriggerProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className' | 'style'> {
  asChild?: boolean
  children?: ReactNode
  ref?: Ref<HTMLButtonElement>
}

function PopoverTrigger({ asChild = false, children, ref, ...props }: PopoverTriggerProps) {
  const context = usePopover()
  const mergedRef = useMergeRefs([context.refs.setReference, ref])
  const interactionProps = context.getReferenceProps({ ...props, ref: mergedRef })
  const triggerProps = {
    ...props,
    ...interactionProps,
    'aria-controls': context.contentId,
    'aria-expanded': context.open,
    'aria-haspopup': 'dialog' as const,
    'data-state': context.open ? 'open' : 'closed',
    'id': props.id ?? context.triggerId,
    'ref': mergedRef,
    'type': 'button' as const,
  }
  return asChild
    ? <Slot {...triggerProps}>{children}</Slot>
    : <button {...triggerProps} type="button">{children}</button>
}

function PopoverAnchor({ children, ref, ...props }: Omit<HTMLAttributes<HTMLDivElement>, 'className' | 'style'> & { children?: ReactNode, ref?: Ref<HTMLDivElement> }) {
  const context = usePopover()
  const mergedRef = useMergeRefs([context.refs.setPositionReference, ref])
  return (
    <div
      {...props}
      ref={mergedRef}
      data-ui="popover-anchor"
    >
      {children}
    </div>
  )
}

function PopoverPortal({ children, forceMount = false }: { children?: ReactNode, forceMount?: boolean }) {
  const context = usePopover()
  if (!context.open && !forceMount)
    return null
  return <FloatingPortal>{children}</FloatingPortal>
}

export type PopoverContentVariant = 'default' | 'panel' | 'popover' | 'translucent'

interface PopoverContentProps extends Omit<HTMLAttributes<HTMLDivElement>, 'className' | 'role' | 'style'> {
  align?: PopoverAlign
  asChild?: boolean
  collisionPadding?: number
  forceMount?: boolean
  ref?: Ref<HTMLDivElement>
  side?: PopoverSide
  sideOffset?: number
  variant?: PopoverContentVariant
  xstyle?: stylex.StyleXStyles
}

function PopoverContent({
  align = 'start',
  asChild = false,
  children,
  collisionPadding = 8,
  forceMount = false,
  ref,
  side = 'bottom',
  sideOffset = 6,
  variant = 'popover',
  xstyle,
  ...props
}: PopoverContentProps) {
  const context = usePopover()
  const mergedRef = useMergeRefs([context.refs.setFloating, ref])
  useEffect(() => {
    context.setCollisionPadding(collisionPadding)
    context.setPlacement(toPlacement(side, align))
    context.setSideOffset(sideOffset)
  }, [align, collisionPadding, context.setCollisionPadding, context.setPlacement, context.setSideOffset, side, sideOffset])
  if (!context.open && !forceMount)
    return null
  const interactionProps = context.getFloatingProps({ ref: mergedRef })
  const contentProps = {
    ...props,
    ...interactionProps,
    'aria-labelledby': props['aria-labelledby'] ?? (props['aria-label'] ? undefined : context.triggerId),
    'data-align': align,
    'data-side': side,
    'data-state': context.open ? 'open' : 'closed',
    'data-ui': 'popover-content',
    'id': props.id ?? context.contentId,
    'ref': mergedRef,
    'role': 'dialog' as const,
    'style': {
      ...context.floatingStyles,
      visibility: context.floatingStyles.transform ? 'visible' as const : 'hidden' as const,
    },
  }
  const contentStyles = stylexRuntime.props(
    popoverStyles.content,
    surfaceStyles.base,
    variant === 'default' ? surfaceStyles.default : variant === 'panel' ? surfaceStyles.panel : variant === 'translucent' ? surfaceStyles.translucent : surfaceStyles.popover,
    xstyle,
  )
  const content = asChild
    ? <Slot {...contentProps} {...contentStyles}>{children}</Slot>
    : <div {...contentProps} {...contentStyles}>{children}</div>
  return (
    <FloatingFocusManager
      context={context.floatingContext}
      initialFocus={context.modal ? undefined : -1}
      modal={context.modal}
      returnFocus
    >
      {content}
    </FloatingFocusManager>
  )
}

function PopoverClose({ asChild = false, children, ...props }: Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className' | 'style'> & { asChild?: boolean, children?: ReactNode }) {
  const context = usePopover()
  const closeProps = {
    ...props,
    'data-ui': 'popover-close',
    'onClick': (event: React.MouseEvent<HTMLButtonElement>) => {
      props.onClick?.(event)
      if (!event.defaultPrevented)
        context.close()
    },
    'type': 'button' as const,
  }
  return asChild
    ? <Slot {...closeProps}>{children}</Slot>
    : <button {...closeProps} type="button">{children}</button>
}

export const Popover = {
  Anchor: PopoverAnchor,
  Close: PopoverClose,
  Content: PopoverContent,
  Portal: PopoverPortal,
  Root: PopoverRoot,
  Trigger: PopoverTrigger,
}
