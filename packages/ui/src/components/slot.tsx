import type { CSSProperties, HTMLAttributes, ReactElement, Ref } from 'react'
import { Children, cloneElement } from 'react'

type SlotElementProps = Record<string, unknown> & {
  className?: string
  ref?: Ref<HTMLElement>
  style?: CSSProperties
}

export interface SlotProps extends HTMLAttributes<HTMLElement> {
  children: ReactElement
  ref?: Ref<HTMLElement>
}

function composeEventHandlers<E extends React.SyntheticEvent>(
  childHandler: ((event: E) => void) | undefined,
  slotHandler: ((event: E) => void) | undefined,
) {
  if (!childHandler)
    return slotHandler
  if (!slotHandler)
    return childHandler
  return (event: E) => {
    childHandler(event)
    if (!event.defaultPrevented)
      slotHandler(event)
  }
}

function assignRef<T>(ref: Ref<T> | undefined, value: T | null) {
  if (typeof ref === 'function')
    ref(value)
  else if (ref)
    ref.current = value
}

function mergeProps(slotProps: Record<string, unknown>, childProps: SlotElementProps) {
  const mergedProps: Record<string, unknown> = { ...slotProps, ...childProps }
  for (const propName of Object.keys(slotProps)) {
    if (!/^on[A-Z]/.test(propName))
      continue
    const slotHandler = slotProps[propName]
    const childHandler = childProps[propName]
    if (typeof slotHandler === 'function' && typeof childHandler === 'function') {
      mergedProps[propName] = composeEventHandlers(childHandler as (event: React.SyntheticEvent) => void, slotHandler as (event: React.SyntheticEvent) => void)
    }
    else if (typeof childHandler === 'function') {
      mergedProps[propName] = childHandler
    }
  }

  if (slotProps.className || childProps.className)
    mergedProps.className = [slotProps.className, childProps.className].filter(Boolean).join(' ')
  const slotStyle = slotProps.style as CSSProperties | undefined
  if (slotStyle || childProps.style)
    mergedProps.style = { ...slotStyle, ...childProps.style }
  const slotRef = slotProps.ref as Ref<HTMLElement> | undefined
  if (slotRef || childProps.ref) {
    mergedProps.ref = (element: HTMLElement | null) => {
      assignRef(childProps.ref, element)
      assignRef(slotRef, element)
    }
  }
  return mergedProps
}

export function Slot({ children, ref: forwardedRef, ...props }: SlotProps) {
  // A single child is the Radix-style asChild contract: it preserves the child's DOM node.
  const child = Children.only(children) as ReactElement<SlotElementProps>
  const mergedProps = mergeProps({ ...props, ref: forwardedRef }, child.props)

  return cloneElement(child, mergedProps)
}
