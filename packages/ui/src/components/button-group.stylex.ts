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
      '@media (prefers-contrast: more)': uiColors.borderStrong,
    },
    borderStyle: 'solid',
    borderWidth: uiColors.controlStroke,
    borderRadius: uiColors.pillRadius,
    backgroundColor: {
      'default': uiColors.surfaceTranslucent,
      '@media (prefers-reduced-transparency: reduce)': uiColors.surfaceOpaque,
      '@media (prefers-contrast: more)': uiColors.surfaceOpaque,
    },
    backdropFilter: {
      'default': uiColors.materialFilter,
      '@media (prefers-reduced-transparency: reduce)': 'none',
    },
    boxShadow: {
      'default': uiColors.shadowSubtle,
      '@media (prefers-contrast: more)': uiColors.controlShadow,
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
