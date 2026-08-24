import * as stylex from '@stylexjs/stylex'
import { uiColors, uiMotion } from '../theme.stylex'

export const surfaceStyles = stylex.create({
  base: {
    boxSizing: 'border-box',
    borderStyle: 'solid',
    borderWidth: 1,
    color: uiColors.text,
    transitionDuration: uiMotion.duration,
    transitionProperty: 'background-color, border-color, box-shadow, color',
    transitionTimingFunction: uiMotion.easing,
  },
  default: {
    borderColor: uiColors.fieldBorder,
    backgroundColor: uiColors.surface,
    boxShadow: uiColors.shadowSubtle,
  },
  panel: {
    borderColor: uiColors.fieldBorder,
    borderRadius: 12,
    backgroundColor: uiColors.surfaceRaised,
    boxShadow: uiColors.shadowRaised,
  },
  popover: {
    borderColor: uiColors.fieldBorder,
    borderRadius: 10,
    backgroundColor: uiColors.surfaceRaised,
    boxShadow: uiColors.shadowRaised,
  },
  translucent: {
    borderColor: uiColors.fieldBorder,
    borderRadius: 12,
    backgroundColor: uiColors.surfaceTranslucent,
    backdropFilter: {
      'default': 'blur(18px) saturate(160%)',
      '@media (prefers-reduced-transparency: reduce)': 'none',
    },
    boxShadow: uiColors.shadowRaised,
  },
})
