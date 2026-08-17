import type * as stylex from '@stylexjs/stylex'
import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from 'react'
import * as stylexRuntime from '@stylexjs/stylex'
import { createContext, use, useCallback, useMemo, useRef } from 'react'
import { useControllableState } from '../hooks/use-controllable-state'
import { segmentedControlStyles } from './segmented-control.stylex'

interface SegmentedControlContextValue {
  disabled: boolean
  getItems: () => readonly [string, HTMLButtonElement][]
  registerItem: (value: string, element: HTMLButtonElement | null) => void
  setValue: (value: string) => void
  value: string
}

const SegmentedControlContext = createContext<SegmentedControlContextValue | null>(null)

function useSegmentedControl(): SegmentedControlContextValue {
  const context = use(SegmentedControlContext)
  if (context === null)
    throw new Error('SegmentedControl.Item must be rendered inside SegmentedControl.Root')
  return context
}

function moveFocus(context: SegmentedControlContextValue, currentValue: string, key: string) {
  const items = context.getItems()
  if (items.length === 0)
    return
  const currentIndex = Math.max(0, items.findIndex(([value]) => value === currentValue))
  const nextIndex = key === 'Home'
    ? 0
    : key === 'End'
      ? items.length - 1
      : (currentIndex + (key === 'ArrowLeft' || key === 'ArrowUp' ? -1 : 1) + items.length) % items.length
  const next = items[nextIndex]
  if (!next)
    return
  next[1].focus()
  context.setValue(next[0])
}

function SegmentedControlRoot({
  children,
  defaultValue = '',
  disabled = false,
  onValueChange,
  value,
  xstyle,
  ...props
}: Omit<HTMLAttributes<HTMLDivElement>, 'className' | 'defaultValue' | 'onChange' | 'style'> & {
  children?: ReactNode
  defaultValue?: string
  disabled?: boolean
  onValueChange?: (value: string) => void
  value?: string
  xstyle?: stylex.StyleXStyles
}) {
  const [currentValue, setValue] = useControllableState({ defaultValue, onValueChange, value })
  const itemRefs = useRef(new Map<string, HTMLButtonElement>())
  const registerItem = useCallback((itemValue: string, element: HTMLButtonElement | null) => {
    if (element)
      itemRefs.current.set(itemValue, element)
    else
      itemRefs.current.delete(itemValue)
  }, [])
  const getItems = useCallback(() => [...itemRefs.current.entries()].filter(([, element]) => !element.disabled), [])
  const contextValue = useMemo(() => ({ disabled, getItems, registerItem, setValue, value: currentValue }), [currentValue, disabled, getItems, registerItem, setValue])
  return (
    <SegmentedControlContext value={contextValue}>
      <div {...props} {...stylexRuntime.props(segmentedControlStyles.root, xstyle)} aria-orientation="horizontal" data-ui="segmented-control" role="radiogroup">
        {children}
      </div>
    </SegmentedControlContext>
  )
}

function SegmentedControlItem({ children, disabled = false, value, xstyle, ...props }: Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className' | 'style' | 'value'> & {
  value: string
  xstyle?: stylex.StyleXStyles
}) {
  const context = useSegmentedControl()
  const selected = context.value === value
  const { registerItem } = context
  const itemRef = useCallback((element: HTMLButtonElement | null) => registerItem(value, element), [registerItem, value])
  return (
    <button
      {...props}
      ref={itemRef}
      {...stylexRuntime.props(segmentedControlStyles.item, selected && segmentedControlStyles.selected, xstyle)}
      aria-checked={selected}
      data-state={selected ? 'checked' : 'unchecked'}
      disabled={context.disabled || disabled}
      role="radio"
      tabIndex={selected || (!context.value && value === context.getItems()[0]?.[0]) ? 0 : -1}
      type="button"
      onClick={(event) => {
        props.onClick?.(event)
        if (!event.defaultPrevented)
          context.setValue(value)
      }}
      onKeyDown={(event) => {
        props.onKeyDown?.(event)
        if (!event.defaultPrevented && ['ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'End', 'Home'].includes(event.key)) {
          event.preventDefault()
          moveFocus(context, value, event.key)
        }
      }}
    >
      {children}
    </button>
  )
}

export const SegmentedControl = {
  Item: SegmentedControlItem,
  Root: SegmentedControlRoot,
}
