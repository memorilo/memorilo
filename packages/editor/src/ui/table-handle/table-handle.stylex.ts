import * as stylex from '@stylexjs/stylex'
import { editorColors } from '../../common/editor-theme.stylex'

export const tableHandleStyles = stylex.create({
  columnPopup: {
    display: 'flex',
    boxSizing: 'border-box',
    translate: '0 50%',
    transitionDuration: {
      'default': '100ms',
      '@media (prefers-reduced-motion: reduce)': '0ms',
    },
  },
  rowPopup: {
    display: 'flex',
    boxSizing: 'border-box',
    translate: '50% 0',
    transitionDuration: {
      'default': '100ms',
      '@media (prefers-reduced-motion: reduce)': '0ms',
    },
  },
  rowPopupRtl: {
    translate: '-50% 0',
  },
  trigger: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxSizing: 'border-box',
    width: 24,
    height: 18,
    overflow: 'clip',
    borderColor: editorColors.gray200,
    borderStyle: 'solid',
    borderWidth: 1,
    borderRadius: 4,
    padding: 0,
    backgroundColor: {
      'default': editorColors.canvas,
      ':hover': editorColors.gray100,
    },
    color: 'oklch(0.551 0.027 264.364 / 50%)',
    transitionDuration: '150ms',
    transitionProperty: 'color, background-color, border-color',
    transitionTimingFunction: 'cubic-bezier(0.4, 0, 0.2, 1)',
  },
  rowTrigger: {
    width: 18,
    height: 24,
  },
  menuPopup: {
    position: 'relative',
    display: 'flex',
    minWidth: 128,
    maxHeight: 400,
    overflow: 'auto',
    flexDirection: 'column',
    borderRadius: 12,
    padding: 4,
    outline: 'none',
    userSelect: 'none',
    whiteSpace: 'nowrap',
  },
  menuItem: {
    'position': 'relative',
    'boxSizing': 'border-box',
    'display': 'flex',
    'alignItems': 'center',
    'justifyContent': 'space-between',
    'minWidth': 128,
    'gap': 32,
    'borderRadius': 4,
    'paddingBlock': 6,
    'paddingInline': 12,
    'cursor': 'default',
    'outline': 'none',
    'scrollMarginBlock': 4,
    'userSelect': 'none',
    'whiteSpace': 'nowrap',
    ':is([data-highlighted])': {
      backgroundColor: editorColors.gray100,
    },
    ':is([data-disabled="true"])': {
      opacity: 0.5,
      pointerEvents: 'none',
    },
  },
  dangerItem: {
    color: editorColors.red500,
  },
  shortcut: {
    color: editorColors.gray500,
    fontSize: 12,
    letterSpacing: '0.1em',
  },
})
