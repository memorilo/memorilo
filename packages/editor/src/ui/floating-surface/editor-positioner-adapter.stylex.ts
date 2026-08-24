import * as stylex from '@stylexjs/stylex'

export const editorPositionerAdapterStyles = stylex.create({
  positioner: {
    display: 'block',
    width: 'min-content',
    height: 'min-content',
    margin: 0,
    overflow: 'visible',
    borderWidth: 0,
    padding: 0,
    backgroundColor: 'transparent',
    zIndex: 50,
    transitionDuration: {
      'default': '100ms',
      '@media (prefers-reduced-motion: reduce)': '0ms',
    },
    transitionProperty: 'transform, translate, scale, rotate',
    transitionTimingFunction: 'cubic-bezier(0, 0, 0.2, 1)',
  },
  motion: {
    'boxSizing': 'border-box',
    'transformOrigin': 'var(--transform-origin)',
    'transitionDuration': {
      'default': '40ms',
      '@media (prefers-reduced-motion: reduce)': '0ms',
    },
    'transitionProperty': 'opacity, scale',
    'transitionTimingFunction': 'cubic-bezier(0.4, 0, 0.2, 1)',
    ':is([data-state="closed"])': {
      opacity: 0,
      scale: 0.95,
      transitionDuration: '150ms',
    },
  },
})
