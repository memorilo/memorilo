import * as stylex from '@stylexjs/stylex'

export const noteLibraryViewMenuStyles = stylex.create({
  viewMenuRoot: {
    display: 'flex',
    height: 32,
    alignItems: 'center',
  },
  viewMenuButton: {
    display: 'flex',
    width: 62,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    borderWidth: 0,
    borderRadius: 16,
    padding: 0,
    backgroundColor: {
      'default': 'transparent',
      ':hover': 'rgba(255, 255, 255, 0.3)',
      ':active': 'rgba(58, 66, 78, 0.14)',
    },
    boxShadow: {
      'default': 'none',
      ':focus-visible': '0 0 0 2px rgba(41, 97, 194, 0.85)',
    },
    color: 'rgba(31, 35, 42, 0.82)',
    cursor: 'default',
    outline: 'none',
    transform: {
      'default': 'scale(1)',
      ':active': 'scale(0.97)',
    },
    transitionDuration: {
      'default': '110ms',
      '@media (prefers-reduced-motion: reduce)': '0ms',
    },
    transitionProperty: 'background-color, box-shadow, transform',
    transitionTimingFunction: 'ease-out',
  },
  viewMenuChevron: {
    transform: 'rotate(0deg)',
    transitionDuration: {
      'default': '150ms',
      '@media (prefers-reduced-motion: reduce)': '0ms',
    },
    transitionProperty: 'transform',
    transitionTimingFunction: 'ease-out',
  },
  viewMenuChevronOpen: {
    transform: 'rotate(180deg)',
  },
})
