import * as stylex from '@stylexjs/stylex'
import { uiColors, uiMotion } from '../theme.stylex'

export const switchStyles = stylex.create({
  root: {
    position: 'relative',
    width: 34,
    height: 20,
    flex: '0 0 34px',
    borderWidth: 0,
    borderRadius: uiColors.pillRadius,
    padding: 0,
    backgroundColor: uiColors.controlPressed,
    cursor: 'default',
    outline: 'none',
    boxShadow: {
      'default': `inset 0 0 0 1px ${uiColors.fieldBorder}`,
      ':focus-visible': `0 0 0 2px ${uiColors.focus}`,
    },
    transform: {
      'default': 'scale(1)',
      ':active': 'scale(0.95)',
    },
    transitionDuration: uiMotion.duration,
    transitionProperty: 'background-color, box-shadow, transform',
    transitionTimingFunction: uiMotion.easing,
  },
  checked: {
    backgroundColor: uiColors.accent,
  },
  compactRoot: {
    width: 32,
    height: 18,
    flexBasis: 32,
    borderRadius: uiColors.pillRadius,
    boxShadow: uiColors.controlShadow,
    transform: {
      'default': 'scale(1)',
      ':active': 'scale(0.94)',
    },
    transitionDuration: {
      'default': '120ms',
      '@media (prefers-reduced-motion: reduce)': '0ms',
    },
    transitionProperty: 'background-color, transform',
    transitionTimingFunction: 'ease-out',
  },
  thumb: {
    position: 'absolute',
    top: 2,
    left: 2,
    width: 16,
    height: 16,
    borderRadius: uiColors.pillRadius,
    backgroundColor: 'white',
    boxShadow: uiColors.controlShadow,
    transform: 'translateX(0)',
    transitionDuration: {
      'default': '150ms',
      '@media (prefers-reduced-motion: reduce)': '0ms',
    },
    transitionProperty: 'transform',
    transitionTimingFunction: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
  },
  thumbChecked: {
    transform: 'translateX(14px)',
  },
  compactThumb: {
    top: 2,
    left: 2,
    width: 14,
    height: 14,
    borderRadius: uiColors.pillRadius,
    boxShadow: uiColors.controlShadow,
    transitionDuration: {
      'default': '140ms',
      '@media (prefers-reduced-motion: reduce)': '0ms',
    },
  },
})
