import * as stylex from '@stylexjs/stylex'

export const noteLibraryViewMenuStyles = stylex.create({
  viewMenuRoot: {
    display: 'flex',
    height: 32,
    alignItems: 'center',
  },
  viewMenuButton: {
    width: 62,
    flex: '0 0 62px',
    gap: 5,
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
