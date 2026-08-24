import * as stylex from '@stylexjs/stylex'
import { uiColors, uiMotion } from '../theme.stylex'

export const selectFieldStyles = stylex.create({
  select: {
    'boxSizing': 'border-box',
    'width': '100%',
    'height': 36,
    'minWidth': 0,
    'borderColor': uiColors.fieldBorder,
    'borderStyle': 'solid',
    'borderWidth': 1,
    'borderRadius': 7,
    'paddingRight': 10,
    'paddingLeft': 10,
    'backgroundColor': uiColors.fieldBackground,
    'color': uiColors.text,
    'fontSize': 13,
    'outline': 'none',
    'transitionDuration': uiMotion.duration,
    'transitionProperty': 'background-color, border-color, box-shadow, color',
    'transitionTimingFunction': uiMotion.easing,
    ':focus': {
      borderColor: uiColors.focus,
      boxShadow: `0 0 0 2px ${uiColors.focus}`,
    },
    ':disabled': {
      cursor: 'default',
      opacity: 0.48,
    },
  },
  settings: {
    height: 30,
    borderRadius: 6,
    paddingRight: 8,
    paddingLeft: 8,
    fontSize: 12,
  },
  compact: {
    height: 28,
    borderRadius: 6,
    paddingRight: 7,
    paddingLeft: 7,
    backgroundColor: uiColors.fieldBackgroundCompact,
    fontSize: 11,
  },
})
