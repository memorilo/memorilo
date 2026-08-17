import * as stylex from '@stylexjs/stylex'
import { uiColors, uiMotion } from '../theme.stylex'

export const switchStyles = stylex.create({
  root: {
    position: 'relative',
    width: 34,
    height: 20,
    flex: '0 0 34px',
    borderWidth: 0,
    borderRadius: 10,
    padding: 0,
    backgroundColor: {
      'default': 'rgba(83, 87, 96, 0.22)',
      '@media (prefers-color-scheme: dark)': 'rgba(235, 238, 244, 0.24)',
    },
    cursor: 'default',
    outline: 'none',
    boxShadow: {
      'default': 'inset 0 0 0 1px rgba(39, 43, 50, 0.08)',
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
    borderRadius: 9,
    boxShadow: 'inset 0 0 0 1px rgba(35, 39, 46, 0.08)',
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
    borderRadius: 8,
    backgroundColor: 'white',
    boxShadow: '0 1px 3px rgba(24, 28, 35, 0.26)',
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
    borderRadius: 7,
    boxShadow: '0 1px 3px rgba(24, 28, 35, 0.24)',
    transitionDuration: {
      'default': '140ms',
      '@media (prefers-reduced-motion: reduce)': '0ms',
    },
  },
})
