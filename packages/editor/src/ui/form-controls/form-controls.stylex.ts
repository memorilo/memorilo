import * as stylex from '@stylexjs/stylex'
import { editorColors } from '../../common/editor-theme.stylex'

export const formControlStyles = stylex.create({
  textInput: {
    'boxSizing': 'border-box',
    'display': 'flex',
    'width': '100%',
    'height': 36,
    'borderColor': editorColors.gray200,
    'borderStyle': 'solid',
    'borderWidth': 1,
    'borderRadius': 6,
    'paddingBlock': 8,
    'paddingInline': 12,
    'backgroundColor': editorColors.canvas,
    'fontSize': 14,
    'boxShadow': {
      'default': 'none',
      ':focus-visible': `0 0 0 2px ${editorColors.gray900}`,
    },
    'outline': 'none',
    'transitionDuration': '150ms',
    'transitionTimingFunction': 'cubic-bezier(0.4, 0, 0.2, 1)',
    '::placeholder': {
      color: editorColors.gray500,
    },
  },
  primaryButton: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    height: 40,
    borderWidth: 0,
    borderRadius: 6,
    paddingBlock: 8,
    paddingInline: 16,
    backgroundColor: {
      'default': editorColors.gray900,
      ':hover': 'rgb(17 24 39 / 90%)',
    },
    color: editorColors.gray50,
    cursor: 'pointer',
    fontSize: 14,
    fontWeight: 500,
    opacity: {
      'default': 1,
      ':disabled': 0.5,
    },
    outline: 'none',
    pointerEvents: {
      'default': 'auto',
      ':disabled': 'none',
    },
    boxShadow: {
      'default': 'none',
      ':focus-visible': `0 0 0 2px ${editorColors.canvas}, 0 0 0 4px ${editorColors.gray900}`,
    },
    transitionDuration: '150ms',
    transitionProperty: 'color, background-color, border-color, box-shadow',
    transitionTimingFunction: 'cubic-bezier(0.4, 0, 0.2, 1)',
    whiteSpace: 'nowrap',
  },
})
