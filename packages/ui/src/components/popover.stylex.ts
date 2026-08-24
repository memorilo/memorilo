import * as stylex from '@stylexjs/stylex'
import { uiMotion } from '../theme.stylex'

export const popoverStyles = stylex.create({
  content: {
    'position': 'absolute',
    'zIndex': 100,
    'maxWidth': 'calc(100vw - 16px)',
    'maxHeight': 'calc(100vh - 16px)',
    'outline': 'none',
    'transformOrigin': 'var(--floating-ui-transform-origin, top left)',
    'transitionDuration': uiMotion.duration,
    'transitionProperty': 'opacity, transform',
    'transitionTimingFunction': uiMotion.easing,
    '@media (prefers-reduced-motion: reduce)': {
      transitionDuration: '0ms',
    },
  },
})
