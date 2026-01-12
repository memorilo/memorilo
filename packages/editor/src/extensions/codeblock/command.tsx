import type { ComponentPropsWithoutRef } from 'react'
import { cn } from '@memorilo/utils'
import { Command as CommandPrimitive } from 'cmdk'

export function Command({
  className,
  ...props
}: ComponentPropsWithoutRef<typeof CommandPrimitive>) {
  return (
    <CommandPrimitive
      className={cn(
        'bg-popover text-popover-foreground flex h-full w-full flex-col overflow-hidden rounded-md',
        className,
      )}
      {...props}
    />
  )
}

export function CommandInput({
  className,
  ...props
}: ComponentPropsWithoutRef<typeof CommandPrimitive.Input>) {
  return (
    <div className="flex h-8 items-center gap-2 border-b px-2">
      <svg
        aria-hidden="true"
        viewBox="0 0 20 20"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        className="size-3.5 shrink-0 opacity-60"
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="m8.5 15 4.5 4.5" />
        <circle cx="8.5" cy="8.5" r="5.5" />
      </svg>
      <CommandPrimitive.Input
        className={cn(
          'placeholder:text-muted-foreground flex h-8 w-full bg-transparent text-[11px] outline-hidden',
          className,
        )}
        {...props}
      />
    </div>
  )
}

export function CommandList({
  className,
  ...props
}: ComponentPropsWithoutRef<typeof CommandPrimitive.List>) {
  return (
    <CommandPrimitive.List
      className={cn('max-h-48 overflow-y-auto overflow-x-hidden', className)}
      {...props}
    />
  )
}

export function CommandEmpty(
  props: ComponentPropsWithoutRef<typeof CommandPrimitive.Empty>,
) {
  return <CommandPrimitive.Empty className="py-2 text-center text-[11px]" {...props} />
}

export function CommandItem({
  className,
  ...props
}: ComponentPropsWithoutRef<typeof CommandPrimitive.Item>) {
  return (
    <CommandPrimitive.Item
      className={cn(
        'data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground flex cursor-default items-center gap-2 px-2 py-1 text-[11px] outline-hidden select-none',
        className,
      )}
      {...props}
    />
  )
}
