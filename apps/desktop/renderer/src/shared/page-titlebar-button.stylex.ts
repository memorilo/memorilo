import * as stylex from '@stylexjs/stylex'

const colors = {
  focus: 'rgba(41, 97, 194, 0.85)',
} as const

export const pageTitlebarButtonStyles = stylex.create({
  button: {
    display: 'grid',
    width: 32,
    height: 32,
    flex: '0 0 32px',
    alignItems: 'center',
    justifyItems: 'center',
    borderWidth: 0,
    borderRadius: 16,
    padding: 0,
    backgroundColor: {
      'default': 'transparent',
      ':hover': 'rgba(255, 255, 255, 0.3)',
      ':active': 'rgba(58, 66, 78, 0.14)',
      ':disabled': 'transparent',
    },
    color: {
      'default': 'rgba(31, 35, 42, 0.82)',
      ':hover': 'rgba(22, 25, 31, 0.94)',
      ':disabled': 'rgba(44, 49, 58, 0.28)',
    },
    cursor: 'default',
    outline: 'none',
    boxShadow: {
      'default': 'none',
      ':focus-visible': `0 0 0 2px ${colors.focus}`,
    },
    transform: {
      'default': 'scale(1)',
      ':active': 'scale(0.96)',
      ':disabled': 'scale(1)',
    },
    transitionDuration: {
      'default': '110ms',
      '@media (prefers-reduced-motion: reduce)': '0ms',
    },
    transitionProperty: 'background-color, box-shadow, color, transform',
    transitionTimingFunction: 'ease-out',
  },
})
