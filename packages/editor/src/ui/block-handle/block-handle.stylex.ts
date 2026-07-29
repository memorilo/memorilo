import * as stylex from '@stylexjs/stylex'
import { editorColors } from '../../common/editor-theme.stylex'

export const blockHandleStyles = stylex.create({
  popup: {
    display: 'flex',
    boxSizing: 'border-box',
    transitionDuration: {
      'default': '100ms',
      '@media (prefers-reduced-motion: reduce)': '0ms',
    },
  },
  button: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxSizing: 'border-box',
    width: 24,
    height: 24,
    borderWidth: 0,
    borderRadius: 4,
    padding: 0,
    backgroundColor: {
      'default': 'transparent',
      ':hover': editorColors.gray100,
    },
    color: 'oklch(0.551 0.027 264.364 / 50%)',
    cursor: 'pointer',
  },
  dragButton: {
    width: 20,
    cursor: 'grab',
  },
})
