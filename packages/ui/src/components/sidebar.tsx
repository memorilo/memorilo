import type * as stylex from '@stylexjs/stylex'
import type { ButtonHTMLAttributes, HTMLAttributes, ReactElement, ReactNode, Ref } from 'react'
import * as stylexRuntime from '@stylexjs/stylex'
import { Children, createContext, use } from 'react'
import { sidebarStyles } from './sidebar.stylex'
import { Slot } from './slot'

export type SidebarVariant = 'settings' | 'workspace'

const SidebarContext = createContext<SidebarVariant | null>(null)

function useSidebarVariant(): SidebarVariant {
  const variant = use(SidebarContext)
  if (variant === null)
    throw new Error('Sidebar compound components must be rendered inside Sidebar.Root')
  return variant
}

interface SidebarRootProps extends Omit<HTMLAttributes<HTMLElement>, 'className' | 'style'> {
  asChild?: boolean
  children?: ReactNode
  ref?: Ref<HTMLElement>
  variant: SidebarVariant
  xstyle?: stylex.StyleXStyles
}

function SidebarRoot({ asChild = false, children, ref: forwardedRef, variant, xstyle, ...props }: SidebarRootProps) {
  const rootProps = {
    ...props,
    'ref': forwardedRef,
    ...stylexRuntime.props(sidebarStyles.root, variant === 'workspace' ? sidebarStyles.workspaceRoot : sidebarStyles.settingsRoot, xstyle),
    'data-ui': 'sidebar',
    'data-variant': variant,
  }
  return (
    <SidebarContext value={variant}>
      {asChild
        ? <Slot {...rootProps}>{Children.only(children) as ReactElement}</Slot>
        : <aside {...rootProps}>{children}</aside>}
    </SidebarContext>
  )
}

function SidebarHeader({ asChild = false, children, xstyle, ...props }: Omit<HTMLAttributes<HTMLDivElement>, 'className' | 'style'> & {
  asChild?: boolean
  children?: ReactNode
  xstyle?: stylex.StyleXStyles
}) {
  const variant = useSidebarVariant()
  const styles = stylexRuntime.props(variant === 'workspace' ? sidebarStyles.workspaceHeader : sidebarStyles.settingsHeader, xstyle)
  return asChild
    ? <Slot {...props} {...styles}>{Children.only(children) as ReactElement}</Slot>
    : <div {...props} {...styles}>{children}</div>
}

function SidebarNavigation({ asChild = false, children, xstyle, ...props }: Omit<HTMLAttributes<HTMLElement>, 'className' | 'style'> & {
  asChild?: boolean
  children?: ReactNode
  xstyle?: stylex.StyleXStyles
}) {
  const variant = useSidebarVariant()
  const styles = stylexRuntime.props(variant === 'workspace' ? sidebarStyles.workspaceNavigation : sidebarStyles.settingsNavigation, xstyle)
  return asChild
    ? <Slot {...props} {...styles}>{Children.only(children) as ReactElement}</Slot>
    : <nav {...props} {...styles}>{children}</nav>
}

function SidebarGroup({ asChild = false, children, xstyle, ...props }: Omit<HTMLAttributes<HTMLElement>, 'className' | 'style'> & {
  asChild?: boolean
  children?: ReactNode
  xstyle?: stylex.StyleXStyles
}) {
  useSidebarVariant()
  const styles = stylexRuntime.props(sidebarStyles.group, xstyle)
  return asChild
    ? <Slot {...props} {...styles}>{Children.only(children) as ReactElement}</Slot>
    : <section {...props} {...styles}>{children}</section>
}

interface SidebarItemProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className' | 'style'> {
  asChild?: boolean
  children: ReactElement | ReactNode
  xstyle?: stylex.StyleXStyles
}

function SidebarItem({ asChild = false, children, type = 'button', xstyle, ...props }: SidebarItemProps) {
  const variant = useSidebarVariant()
  const styleProps = stylexRuntime.props(
    sidebarStyles.item,
    variant === 'workspace' ? sidebarStyles.workspaceItem : sidebarStyles.settingsItem,
    xstyle,
  )
  if (asChild) {
    if (!children || typeof children !== 'object')
      throw new TypeError('Sidebar.Item with asChild requires one React element')
    return (
      <Slot {...props} {...styleProps} data-ui="sidebar-item">
        {children as ReactElement}
      </Slot>
    )
  }
  return (
    <button {...props} {...styleProps} data-ui="sidebar-item" type={type}>
      {children}
    </button>
  )
}

function SidebarItemIcon({ active = false, children, xstyle, ...props }: Omit<HTMLAttributes<HTMLSpanElement>, 'className' | 'style'> & {
  active?: boolean
  children?: ReactNode
  xstyle?: stylex.StyleXStyles
}) {
  const variant = useSidebarVariant()
  return (
    <span
      {...props}
      {...stylexRuntime.props(
        sidebarStyles.icon,
        variant === 'workspace' ? sidebarStyles.workspaceIcon : sidebarStyles.settingsIcon,
        active && (variant === 'workspace' ? sidebarStyles.iconActiveWorkspace : sidebarStyles.iconActiveSettings),
        xstyle,
      )}
    >
      {children}
    </span>
  )
}

function SidebarItemLabel({ active = false, children, xstyle, ...props }: Omit<HTMLAttributes<HTMLSpanElement>, 'className' | 'style'> & {
  active?: boolean
  children?: ReactNode
  xstyle?: stylex.StyleXStyles
}) {
  const variant = useSidebarVariant()
  return (
    <span
      {...props}
      {...stylexRuntime.props(
        sidebarStyles.label,
        variant === 'workspace' ? sidebarStyles.workspaceLabel : sidebarStyles.settingsLabel,
        active && (variant === 'workspace' ? sidebarStyles.labelActiveWorkspace : sidebarStyles.labelActiveSettings),
        xstyle,
      )}
    >
      {children}
    </span>
  )
}

export const Sidebar = {
  Group: SidebarGroup,
  Header: SidebarHeader,
  Item: SidebarItem,
  ItemIcon: SidebarItemIcon,
  ItemLabel: SidebarItemLabel,
  Navigation: SidebarNavigation,
  Root: SidebarRoot,
}
