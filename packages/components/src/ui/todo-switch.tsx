'use client'

import { cn } from '@memorilo/utils'
import * as SwitchPrimitive from '@radix-ui/react-switch'
import * as React from 'react'

type TodoSwitchProps = React.ComponentProps<typeof SwitchPrimitive.Root> & {
  checkedLabel: React.ReactNode
  uncheckedLabel: React.ReactNode
  checkedTrackClassName?: string
  uncheckedTrackClassName?: string
  checkedLabelClassName?: string
  uncheckedLabelClassName?: string
}

function TodoSwitch({
  className,
  checkedLabel,
  uncheckedLabel,
  checkedTrackClassName,
  uncheckedTrackClassName,
  checkedLabelClassName,
  uncheckedLabelClassName,
  checked,
  defaultChecked,
  onCheckedChange,
  style,
  ...props
}: TodoSwitchProps) {
  const isControlled = checked !== undefined
  const [uncontrolledChecked, setUncontrolledChecked] = React.useState(
    defaultChecked ?? false,
  )
  const currentChecked = isControlled ? checked : uncontrolledChecked

  const handleCheckedChange = React.useCallback(
    (nextChecked: boolean) => {
      if (!isControlled)
        setUncontrolledChecked(nextChecked)
      onCheckedChange?.(nextChecked)
    },
    [isControlled, onCheckedChange],
  )

  const mergedStyle = React.useMemo(() => {
    return {
      '--todo-switch-thumb': '1rem',
      '--todo-switch-inset': '2px',
      '--todo-switch-gap': '0.25rem',
      '--todo-switch-side': 'calc((var(--todo-switch-thumb) + var(--todo-switch-gap)) / 4)',
      ...style,
    } as React.CSSProperties
  }, [style])

  return (
    <SwitchPrimitive.Root
      data-slot="todo-switch"
      className={cn(
        'relative inline-flex h-5 shrink-0 items-center justify-center rounded-full border border-black/10 shadow-xs ring-1 ring-black/5 outline-none',
        'transition-colors duration-200 ease-in-out',
        currentChecked ? checkedTrackClassName : uncheckedTrackClassName,
        'focus-visible:ring-ring/50 focus-visible:ring-[3px]',
        'disabled:cursor-not-allowed disabled:opacity-50',
        'dark:border-white/10 dark:ring-white/10',
        className,
      )}
      checked={checked}
      defaultChecked={defaultChecked}
      onCheckedChange={handleCheckedChange}
      style={mergedStyle}
      {...props}
    >
      <span
        aria-hidden
        data-slot="todo-switch-sizer"
        className="pointer-events-none invisible flex items-center px-[var(--todo-switch-inset)]"
      >
        <span className="block size-[var(--todo-switch-thumb)]" />
        <span className="block w-[var(--todo-switch-gap)]" />
        <span
          data-slot="todo-switch-sizer-labels"
          className="grid place-items-center px-0.5 text-[10px] font-semibold leading-none tracking-wide"
        >
          <span className="col-start-1 row-start-1 whitespace-nowrap">
            {checkedLabel}
          </span>
          <span className="col-start-1 row-start-1 whitespace-nowrap">
            {uncheckedLabel}
          </span>
        </span>
      </span>

      <span
        data-slot="todo-switch-label-layer"
        className="pointer-events-none absolute inset-0 grid place-items-center"
      >
        <span
          data-slot="todo-switch-checked-label"
          className={cn(
            'col-start-1 row-start-1 flex w-full items-center justify-center px-0.5 text-[10px] font-semibold leading-none tracking-wide transition-opacity duration-150 ease-in-out',
            'pl-[calc(var(--todo-switch-inset)+var(--todo-switch-side))] pr-[calc(var(--todo-switch-inset)+var(--todo-switch-thumb)+var(--todo-switch-gap))]',
            currentChecked ? 'opacity-100' : 'opacity-0',
            checkedLabelClassName,
          )}
        >
          {checkedLabel}
        </span>
        <span
          data-slot="todo-switch-unchecked-label"
          className={cn(
            'col-start-1 row-start-1 flex w-full items-center justify-center px-0.5 text-[10px] font-semibold leading-none tracking-wide transition-opacity duration-150 ease-in-out',
            'pl-[calc(var(--todo-switch-inset)+var(--todo-switch-thumb)+var(--todo-switch-gap))] pr-[calc(var(--todo-switch-inset)+var(--todo-switch-side))]',
            currentChecked ? 'opacity-0' : 'opacity-100',
            uncheckedLabelClassName,
          )}
        >
          {uncheckedLabel}
        </span>
      </span>

      <SwitchPrimitive.Thumb
        data-slot="todo-switch-thumb"
        className={cn(
          'pointer-events-none absolute top-1/2 z-10 block size-[var(--todo-switch-thumb)] -translate-y-1/2 rounded-full bg-white shadow-xs ring-0 transition-[left] duration-200 ease-in-out',
          'data-[state=unchecked]:left-[var(--todo-switch-inset)]',
          'data-[state=checked]:left-[calc(100%-var(--todo-switch-thumb)-var(--todo-switch-inset))]',
        )}
      />
    </SwitchPrimitive.Root>
  )
}

export { TodoSwitch }
