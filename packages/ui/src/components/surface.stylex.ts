import * as stylex from '@stylexjs/stylex'
import { uiColors, uiMotion } from '../theme.stylex'

export const surfaceStyles = stylex.create({
  base: {
    boxSizing: 'border-box',
    borderStyle: 'solid',
    borderWidth: uiColors.surfaceStroke,
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
    borderRadius: uiColors.surfaceRadius,
    backgroundColor: uiColors.surfaceRaised,
    boxShadow: uiColors.shadowRaised,
  },
  popover: {
    borderColor: uiColors.fieldBorder,
    borderRadius: uiColors.controlRadius,
    backgroundColor: uiColors.surfaceRaised,
    boxShadow: uiColors.shadowRaised,
  },
  translucent: {
    borderColor: uiColors.fieldBorder,
    borderRadius: uiColors.surfaceRadius,
    backgroundColor: uiColors.surfaceTranslucent,
    backdropFilter: {
      'default': uiColors.materialFilter,
      '@media (prefers-reduced-transparency: reduce)': 'none',
    },
    boxShadow: uiColors.shadowRaised,
  },
})
