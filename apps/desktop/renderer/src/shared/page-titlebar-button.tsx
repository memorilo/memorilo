import type { ReactNode } from 'react'
import * as stylex from '@stylexjs/stylex'

import { pageTitlebarButtonStyles as styles } from './page-titlebar-button.stylex'

export function PageTitlebarButton({
  children,
  disabled = false,
  label,
  onClick,
  title = label,
}: {
  children: ReactNode
  disabled?: boolean
  label: string
  onClick: () => void
  title?: string
}) {
  return (
    <button
      {...stylex.props(styles.button)}
      aria-label={label}
      data-window-no-drag=""
      disabled={disabled}
      title={title}
      type="button"
      onClick={onClick}
    >
      {children}
    </button>
  )
}
