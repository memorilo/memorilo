import * as stylex from '@stylexjs/stylex'

export const todoTaskOccurrenceActionStyles = stylex.create({
  shell: {
    'display': 'inline-flex',
    'width': 20,
    'height': 20,
    'flex': '0 0 20px',
    'alignItems': 'center',
    'justifyContent': 'center',
    'borderRadius': 10,
    'color': 'inherit',
    'cursor': 'pointer',
    'outline': 'none',
    'transitionDuration': {
      'default': '100ms',
      '@media (prefers-reduced-motion: reduce)': '0ms',
    },
    'transitionProperty': 'background-color, box-shadow, transform',
    'transitionTimingFunction': 'ease-out',
    ':hover': {
      backgroundColor: 'rgba(118, 118, 128, 0.11)',
    },
    ':active': {
      transform: 'scale(0.93)',
      backgroundColor: 'rgba(118, 118, 128, 0.16)',
    },
    ':focus-visible': {
      boxShadow: '0 0 0 2px rgba(0, 122, 255, 0.72)',
    },
  },
})
