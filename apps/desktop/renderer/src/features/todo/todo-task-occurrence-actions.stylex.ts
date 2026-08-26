import * as stylex from '@stylexjs/stylex'

export const todoTaskOccurrenceActionStyles = stylex.create({
  shell: {
    'display': 'inline-flex',
    'width': 20,
    'height': 20,
    'flex': '0 0 20px',
    'alignItems': 'center',
    'justifyContent': 'center',
    'borderRadius': 'var(--ui-control-radius, 10px)',
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
      backgroundColor: 'var(--ui-control-hover, rgba(118, 118, 128, 0.11))',
    },
    ':active': {
      transform: 'scale(0.93)',
      backgroundColor: 'var(--ui-control-pressed, rgba(118, 118, 128, 0.16))',
    },
    ':focus-visible': {
      boxShadow: '0 0 0 2px var(--ui-focus, rgba(0, 122, 255, 0.72))',
    },
  },
})
