import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { Popover, PopoverContent, PopoverTrigger } from '@memorilo/components/ui/popover'
import { Tooltip, TooltipContent, TooltipTrigger } from '@memorilo/components/ui/tooltip'
import { cn } from '@memorilo/utils'
import { createContext, use, useCallback, useMemo, useState } from 'react'
import { ReactEditor, useSlateStatic } from 'slate-react'
import { UtilButton } from '../util-button'

interface ToolbarActionPopoverContextValue {
  disabled: boolean
  close: () => void
}

const ToolbarActionPopoverContext = createContext<ToolbarActionPopoverContextValue | null>(null)

function useToolbarActionPopoverContext() {
  const value = use(ToolbarActionPopoverContext)
  if (!value)
    throw new Error('ToolbarActionPopover components must be used within ToolbarActionPopover.')
  return value
}

export interface ToolbarActionPopoverProps {
  disabled?: boolean
  children: ReactNode
}

export function ToolbarActionPopover({ disabled = false, children }: ToolbarActionPopoverProps) {
  const editor = useSlateStatic()
  const [open, setOpen] = useState(false)

  const close = useCallback(() => {
    setOpen(false)
    ReactEditor.focus(editor)
  }, [editor])

  const handleOpenChange = useCallback((nextOpen: boolean) => {
    if (disabled) {
      setOpen(false)
      return
    }
    setOpen(nextOpen)
    if (!nextOpen)
      ReactEditor.focus(editor)
  }, [disabled, editor])

  const contextValue = useMemo(() => ({ disabled, close }), [disabled, close])

  return (
    <ToolbarActionPopoverContext value={contextValue}>
      <Popover open={open} onOpenChange={handleOpenChange}>
        {children}
      </Popover>
    </ToolbarActionPopoverContext>
  )
}

export interface ToolbarActionPopoverTriggerProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string
  children: ReactNode
}

export function ToolbarActionPopoverTrigger({
  label,
  children,
  disabled,
  ...props
}: ToolbarActionPopoverTriggerProps) {
  const { disabled: popoverDisabled } = useToolbarActionPopoverContext()
  const isDisabled = popoverDisabled || disabled

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <PopoverTrigger asChild>
          <span className="inline-flex">
            <UtilButton
              {...props}
              disabled={isDisabled}
              aria-label={label}
              title={label}
            >
              {children}
            </UtilButton>
          </span>
        </PopoverTrigger>
      </TooltipTrigger>
      <TooltipContent sideOffset={6}>
        {label}
      </TooltipContent>
    </Tooltip>
  )
}

export interface ToolbarActionPopoverContentProps {
  children: ReactNode
  className?: string
}

export function ToolbarActionPopoverContent({
  children,
  className,
}: ToolbarActionPopoverContentProps) {
  return (
    <PopoverContent
      align="start"
      className={cn('w-48 space-y-1 p-2', className)}
      onOpenAutoFocus={event => event.preventDefault()}
      onCloseAutoFocus={event => event.preventDefault()}
      onMouseDown={(event) => {
        event.preventDefault()
      }}
    >
      {children}
    </PopoverContent>
  )
}

export interface ToolbarActionPopoverItemProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onClick'> {
  destructive?: boolean
  onSelect?: () => void
  children: ReactNode
}

export function ToolbarActionPopoverItem({
  destructive,
  onSelect,
  disabled,
  className,
  children,
  ...props
}: ToolbarActionPopoverItemProps) {
  const { disabled: popoverDisabled, close } = useToolbarActionPopoverContext()
  const isDisabled = popoverDisabled || disabled

  const handleClick = useCallback(() => {
    if (isDisabled)
      return
    onSelect?.()
    close()
  }, [close, isDisabled, onSelect])

  return (
    <UtilButton
      {...props}
      disabled={isDisabled}
      className={cn(
        'flex w-full items-center justify-start gap-2 text-sm',
        destructive && 'text-red-500',
        className,
      )}
      onClick={handleClick}
    >
      {children}
    </UtilButton>
  )
}
