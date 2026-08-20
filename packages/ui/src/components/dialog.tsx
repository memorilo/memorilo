import type * as stylex from '@stylexjs/stylex'
import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode, Ref } from 'react'
import * as stylexRuntime from '@stylexjs/stylex'
import { createContext, use, useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useControllableState } from '../hooks/use-controllable-state'
import { dialogStyles } from './dialog.stylex'
import { Slot } from './slot'

type DialogRole = 'alertdialog' | 'dialog'
export type DialogContentVariant = 'alert' | 'command' | 'compact' | 'default' | 'sheet' | 'wide'
export type DialogOverlayVariant = 'default' | 'note' | 'sheet'

interface DialogContextValue {
  close: () => void
  contentId: string
  descriptionId: string
  descriptionMounted: boolean
  modal: boolean
  open: boolean
  registerContent: (element: HTMLElement | null) => void
  registerDescription: (mounted: boolean) => void
  registerTitle: (mounted: boolean) => void
  role: DialogRole
  setOpen: (open: boolean) => void
  titleId: string
  titleMounted: boolean
  triggerRef: { current: HTMLElement | null }
}

const DialogContext = createContext<DialogContextValue | null>(null)

function useDialog(): DialogContextValue {
  const context = use(DialogContext)
  if (context === null)
    throw new Error('Dialog compound components must be rendered inside Dialog.Root')
  return context
}

function assignRef<T>(ref: Ref<T> | undefined, value: T | null) {
  if (typeof ref === 'function')
    ref(value)
  else if (ref)
    ref.current = value
}

interface DialogRootProps {
  children?: ReactNode
  defaultOpen?: boolean
  modal?: boolean
  onOpenChange?: (open: boolean) => void
  open?: boolean
}

function DialogRoot({ children, defaultOpen = false, modal = true, onOpenChange, open, role = 'dialog' }: DialogRootProps & { role?: DialogRole }) {
  const [currentOpen, setOpen] = useControllableState({ defaultValue: defaultOpen, onValueChange: onOpenChange, value: open })
  const triggerRef = useRef<HTMLElement | null>(null)
  const contentRef = useRef<HTMLElement | null>(null)
  const [descriptionMounted, registerDescription] = useState(false)
  const [titleMounted, registerTitle] = useState(false)
  const id = useId()
  const setContent = useCallback((element: HTMLElement | null) => {
    contentRef.current = element
  }, [])
  const close = useCallback(() => setOpen(false), [setOpen])
  const context = useMemo<DialogContextValue>(() => ({
    close,
    contentId: `${id}-content`,
    descriptionId: `${id}-description`,
    descriptionMounted,
    modal,
    open: currentOpen,
    registerContent: setContent,
    registerDescription,
    registerTitle,
    role,
    setOpen,
    titleId: `${id}-title`,
    titleMounted,
    triggerRef,
  }), [close, currentOpen, descriptionMounted, id, modal, role, setContent, setOpen, titleMounted])

  useEffect(() => {
    if (!currentOpen)
      return
    const content = contentRef.current
    const trigger = triggerRef.current
    const activeElement = document.activeElement
    const focusTarget = activeElement instanceof HTMLElement && content?.contains(activeElement)
      ? activeElement
      : content?.querySelector<HTMLElement>('button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), [tabindex]:not([tabindex="-1"])') ?? content
    focusTarget?.focus()
    return () => {
      if (trigger?.isConnected)
        trigger.focus()
    }
  }, [currentOpen])

  useEffect(() => {
    if (!currentOpen)
      return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.defaultPrevented) {
        event.preventDefault()
        close()
        return
      }
      if (event.key !== 'Tab' || event.defaultPrevented)
        return
      const content = contentRef.current
      if (!content)
        return
      const focusable = [...content.querySelectorAll<HTMLElement>(
        'button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), a[href], [tabindex]:not([tabindex="-1"])',
      )].filter(element => !element.hasAttribute('hidden'))
      const first = focusable[0]
      const last = focusable.at(-1)
      if (!first || !last) {
        event.preventDefault()
        content.focus()
      }
      else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      }
      else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [close, currentOpen])

  return <DialogContext value={context}>{children}</DialogContext>
}

function DialogTrigger({ asChild = false, children, ...props }: Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className' | 'style'> & {
  asChild?: boolean
  children?: ReactNode
}) {
  const context = useDialog()
  const triggerProps = {
    ...props,
    'aria-controls': context.contentId,
    'aria-expanded': context.open,
    'aria-haspopup': 'dialog' as const,
    'data-state': context.open ? 'open' : 'closed',
    'onClick': (event: React.MouseEvent<HTMLButtonElement>) => {
      props.onClick?.(event)
      if (!event.defaultPrevented)
        context.setOpen(!context.open)
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

function DialogPortal({ children, forceMount = false }: { children?: ReactNode, forceMount?: boolean }) {
  const context = useDialog()
  if (!context.open && !forceMount)
    return null
  if (typeof document === 'undefined')
    return <>{children}</>
  return createPortal(children, document.body)
}

interface DialogOverlayProps extends Omit<HTMLAttributes<HTMLDivElement>, 'className' | 'style'> {
  asChild?: boolean
  forceMount?: boolean
  variant?: DialogOverlayVariant
  xstyle?: stylex.StyleXStyles
}

function DialogOverlay({ asChild = false, children, forceMount = false, variant = 'default', xstyle, ...props }: DialogOverlayProps & { children?: ReactNode }) {
  const context = useDialog()
  if (!context.open && !forceMount)
    return null
  const overlayProps = {
    ...props,
    'aria-hidden': true as const,
    'data-state': context.open ? 'open' : 'closed',
    'data-ui': 'dialog-overlay',
    'data-variant': variant,
    'onPointerDown': (event: React.PointerEvent<HTMLDivElement>) => {
      props.onPointerDown?.(event)
      if (!event.defaultPrevented && event.target === event.currentTarget && context.modal && context.role === 'dialog')
        context.close()
    },
  }
  const variantStyle = variant === 'note'
    ? dialogStyles.noteOverlay
    : variant === 'sheet'
      ? dialogStyles.sheetOverlay
      : dialogStyles.defaultOverlay
  const styles = stylexRuntime.props(dialogStyles.overlay, variantStyle, xstyle)
  return asChild
    ? <Slot {...overlayProps} {...styles}>{children}</Slot>
    : <div {...overlayProps} {...styles}>{children}</div>
}

interface DialogContentProps extends Omit<HTMLAttributes<HTMLElement>, 'className' | 'role' | 'style'> {
  asChild?: boolean
  forceMount?: boolean
  position?: 'center' | 'custom'
  ref?: Ref<HTMLElement>
  variant?: DialogContentVariant
  xstyle?: stylex.StyleXStyles
}

function DialogContent({ asChild = false, children, forceMount = false, position = 'center', ref, variant = 'default', xstyle, ...props }: DialogContentProps) {
  const context = useDialog()
  const { registerContent } = context
  const setContent = useCallback((element: HTMLElement | null) => {
    registerContent(element)
    assignRef(ref, element)
  }, [ref, registerContent])
  if (!context.open && !forceMount)
    return null
  const contentProps = {
    ...props,
    'aria-describedby': props['aria-describedby'] ?? (context.descriptionMounted ? context.descriptionId : undefined),
    'aria-labelledby': props['aria-labelledby'] ?? (props['aria-label'] ? undefined : context.titleMounted ? context.titleId : undefined),
    'aria-modal': context.modal ? true : undefined,
    'data-state': context.open ? 'open' : 'closed',
    'data-ui': 'dialog-content',
    'data-variant': variant,
    'id': props.id ?? context.contentId,
    'onKeyDown': (event: React.KeyboardEvent<HTMLElement>) => {
      props.onKeyDown?.(event)
      if (!event.defaultPrevented && event.key === 'Escape') {
        event.preventDefault()
        context.close()
      }
    },
    'ref': setContent,
    'role': context.role,
    'tabIndex': props.tabIndex ?? -1,
  }
  const variantStyle = variant === 'alert'
    ? dialogStyles.alertContent
    : variant === 'command'
      ? dialogStyles.commandContent
      : variant === 'compact'
        ? dialogStyles.compactContent
        : variant === 'sheet'
          ? dialogStyles.sheetContent
          : variant === 'wide'
            ? dialogStyles.wideContent
            : undefined
  const styles = stylexRuntime.props(dialogStyles.content, position === 'custom' && dialogStyles.customContent, variantStyle, xstyle)
  return asChild
    ? <Slot {...contentProps} {...styles}>{children}</Slot>
    : <div {...contentProps} {...styles}>{children}</div>
}

function DialogHeader({ children, xstyle, ...props }: Omit<HTMLAttributes<HTMLDivElement>, 'className' | 'style'> & { children?: ReactNode, xstyle?: stylex.StyleXStyles }) {
  return <div {...props} {...stylexRuntime.props(dialogStyles.header, xstyle)}>{children}</div>
}

function DialogTitle({ children, xstyle, ...props }: Omit<HTMLAttributes<HTMLHeadingElement>, 'className' | 'style'> & { children?: ReactNode, xstyle?: stylex.StyleXStyles }) {
  const context = useDialog()
  const { registerTitle } = context
  useEffect(() => {
    registerTitle(true)
    return () => registerTitle(false)
  }, [registerTitle])
  return <h2 {...props} {...stylexRuntime.props(dialogStyles.title, xstyle)} id={props.id ?? context.titleId}>{children}</h2>
}

function DialogDescription({ children, xstyle, ...props }: Omit<HTMLAttributes<HTMLParagraphElement>, 'className' | 'style'> & { children?: ReactNode, xstyle?: stylex.StyleXStyles }) {
  const context = useDialog()
  const { registerDescription } = context
  useEffect(() => {
    registerDescription(true)
    return () => registerDescription(false)
  }, [registerDescription])
  return <p {...props} {...stylexRuntime.props(dialogStyles.description, xstyle)} id={props.id ?? context.descriptionId}>{children}</p>
}

function DialogBody({ children, xstyle, ...props }: Omit<HTMLAttributes<HTMLDivElement>, 'className' | 'style'> & { children?: ReactNode, xstyle?: stylex.StyleXStyles }) {
  return <div {...props} {...stylexRuntime.props(dialogStyles.body, xstyle)}>{children}</div>
}

function DialogFooter({ children, xstyle, ...props }: Omit<HTMLAttributes<HTMLDivElement>, 'className' | 'style'> & { children?: ReactNode, xstyle?: stylex.StyleXStyles }) {
  return <div {...props} {...stylexRuntime.props(dialogStyles.footer, xstyle)}>{children}</div>
}

function DialogClose({ asChild = false, children, ...props }: Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className' | 'style'> & { asChild?: boolean, children?: ReactNode }) {
  const context = useDialog()
  const closeProps = {
    ...props,
    'data-ui': 'dialog-close',
    'onClick': (event: React.MouseEvent<HTMLButtonElement>) => {
      props.onClick?.(event)
      if (!event.defaultPrevented)
        context.close()
    },
    'type': 'button' as const,
  }
  if (asChild)
    return <Slot {...closeProps}>{children}</Slot>
  return <button {...closeProps} {...stylexRuntime.props(dialogStyles.close)} type="button">{children}</button>
}

function AlertDialogRoot(props: DialogRootProps) {
  return <DialogRoot {...props} role="alertdialog" modal />
}

export const Dialog = {
  Body: DialogBody,
  Close: DialogClose,
  Content: DialogContent,
  Description: DialogDescription,
  Footer: DialogFooter,
  Header: DialogHeader,
  Overlay: DialogOverlay,
  Portal: DialogPortal,
  Root: DialogRoot,
  Title: DialogTitle,
  Trigger: DialogTrigger,
}

export const AlertDialog = {
  ...Dialog,
  Action: DialogClose,
  Cancel: DialogClose,
  Root: AlertDialogRoot,
}
