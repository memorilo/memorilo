import * as stylex from '@stylexjs/stylex'
import { noteTheme } from './editor/note-shared.stylex'

export const noteInspectorActionsStyles = stylex.create({
  expandingFavorite: {
    display: 'flex',
    flexShrink: 0,
    overflow: 'hidden',
  },
  button: {
    display: 'grid',
    width: 32,
    height: 32,
    flexShrink: 0,
    alignItems: 'center',
    justifyItems: 'center',
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
      ':focus-visible': `0 0 0 2px ${noteTheme.focus}`,
    },
    color: noteTheme.chromeTextMuted,
    cursor: 'default',
    outline: 'none',
    transform: {
      'default': 'scale(1)',
      ':active': 'scale(0.95)',
    },
    transitionDuration: {
      'default': '100ms',
      '@media (prefers-reduced-motion: reduce)': '0ms',
    },
    transitionProperty: 'background-color, color, transform',
    transitionTimingFunction: 'ease-out',
  },
  buttonActive: {
    backgroundColor: {
      'default': 'rgba(58, 66, 78, 0.12)',
      ':hover': 'rgba(58, 66, 78, 0.16)',
      ':active': 'rgba(58, 66, 78, 0.2)',
    },
    color: noteTheme.chromeText,
  },
  favoriteActive: {
    color: 'rgb(215, 151, 25)',
  },
})
