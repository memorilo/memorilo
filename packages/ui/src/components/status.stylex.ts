import * as stylex from '@stylexjs/stylex'
import { uiColors } from '../theme.stylex'

export const statusStyles = stylex.create({
  root: {
    display: 'flex',
    minWidth: 0,
    alignItems: 'center',
    gap: 8,
    color: uiColors.textMuted,
  },
  neutral: {},
  success: {
    color: uiColors.statusSuccess,
  },
  error: {
    color: uiColors.danger,
  },
})
