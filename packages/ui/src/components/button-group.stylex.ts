import * as stylex from '@stylexjs/stylex'
import { uiColors } from '../theme.stylex'

export const buttonGroupStyles = stylex.create({
  base: {
    display: 'flex',
    alignItems: 'center',
  },
  glass: {
    height: 36,
    padding: 1,
    borderColor: {
      'default': uiColors.fieldBorder,
      '@media (prefers-contrast: more)': 'rgba(35, 39, 46, 0.82)',
    },
    borderStyle: 'solid',
    borderWidth: uiColors.controlStroke,
    borderRadius: uiColors.surfaceRadius,
    backgroundColor: {
      'default': uiColors.surfaceTranslucent,
      '@media (prefers-reduced-transparency: reduce)': 'rgb(240, 242, 246)',
      '@media (prefers-contrast: more)': 'rgb(248, 249, 251)',
    },
    backdropFilter: {
      'default': uiColors.materialFilter,
      '@media (prefers-reduced-transparency: reduce)': 'none',
    },
    boxShadow: {
      'default': uiColors.shadowSubtle,
      '@media (prefers-contrast: more)': '0 4px 12px rgba(22, 27, 35, 0.16)',
    },
  },
  toolbar: {
    gap: 2,
    borderColor: uiColors.fieldBorder,
    borderStyle: 'solid',
    borderWidth: 1,
    borderRadius: uiColors.controlRadius,
    padding: 3,
    backgroundColor: uiColors.surfaceTranslucent,
    boxShadow: uiColors.controlShadow,
  },
  plain: {
    gap: 4,
  },
})
