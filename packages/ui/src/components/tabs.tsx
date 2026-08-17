import type * as stylex from '@stylexjs/stylex'
import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from 'react'
import * as stylexRuntime from '@stylexjs/stylex'
import { createContext, use, useCallback, useMemo, useRef } from 'react'
import { useControllableState } from '../hooks/use-controllable-state'
import { tabsStyles } from './tabs.stylex'

interface TabsContextValue {
  getItems: () => readonly [string, HTMLButtonElement][]
  registerItem: (value: string, element: HTMLButtonElement | null) => void
  setValue: (value: string) => void
  value: string
}

const TabsContext = createContext<TabsContextValue | null>(null)

function useTabs(): TabsContextValue {
  const context = use(TabsContext)
  if (context === null)
    throw new Error('Tabs compound components must be rendered inside Tabs.Root')
  return context
}

function moveFocus(context: TabsContextValue, currentValue: string, key: string) {
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

function TabsRoot({ children, defaultValue = '', onValueChange, value }: {
  children?: ReactNode
  defaultValue?: string
  onValueChange?: (value: string) => void
  value?: string
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
  const contextValue = useMemo(() => ({ getItems, registerItem, setValue, value: currentValue }), [currentValue, getItems, registerItem, setValue])
  return <TabsContext value={contextValue}>{children}</TabsContext>
}

function TabsList({ children, xstyle, ...props }: Omit<HTMLAttributes<HTMLDivElement>, 'className' | 'style'> & {
  children?: ReactNode
  xstyle?: stylex.StyleXStyles
}) {
  useTabs()
  return <div {...props} {...stylexRuntime.props(tabsStyles.list, xstyle)} data-ui="tabs-list" role="tablist">{children}</div>
}

function TabsTrigger({ children, value, xstyle, ...props }: Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className' | 'style' | 'value'> & {
  value: string
  xstyle?: stylex.StyleXStyles
}) {
  const context = useTabs()
  const selected = context.value === value
  const { registerItem } = context
  const itemRef = useCallback((element: HTMLButtonElement | null) => registerItem(value, element), [registerItem, value])
  return (
    <button
      {...props}
      ref={itemRef}
      {...stylexRuntime.props(tabsStyles.trigger, selected && tabsStyles.selected, xstyle)}
      aria-selected={selected}
      data-state={selected ? 'active' : 'inactive'}
      role="tab"
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

export const Tabs = {
  List: TabsList,
  Root: TabsRoot,
  Trigger: TabsTrigger,
}
