import * as stylex from '@stylexjs/stylex'
import { uiColors } from '../theme.stylex'

export const textFieldStyles = stylex.create({
  input: {
    'boxSizing': 'border-box',
    'width': '100%',
    'height': 36,
    'minWidth': 0,
    'borderColor': {
      'default': 'rgba(71, 76, 86, 0.2)',
      '@media (prefers-color-scheme: dark)': 'rgba(255, 255, 255, 0.16)',
      ':focus': uiColors.focus,
      ':invalid': 'rgba(184, 62, 62, 0.74)',
    },
    'borderStyle': 'solid',
    'borderWidth': 1,
    'borderRadius': 7,
    'paddingRight': 10,
    'paddingLeft': 10,
    'backgroundColor': {
      'default': 'rgba(255, 255, 255, 0.78)',
      '@media (prefers-color-scheme: dark)': 'rgba(255, 255, 255, 0.09)',
    },
    'color': uiColors.text,
    'fontSize': 13,
    'outline': 'none',
    'boxShadow': {
      'default': 'inset 0 1px 2px rgba(25, 30, 38, 0.05)',
      ':focus': '0 0 0 2px rgba(41, 97, 194, 0.14)',
    },
    '::placeholder': {
      color: uiColors.textQuiet,
    },
  },
  settings: {
    height: 30,
    borderRadius: 6,
    paddingRight: 8,
    paddingLeft: 8,
    color: uiColors.text,
    fontSize: 12,
    lineHeight: '18px',
  },
  compact: {
    height: 28,
    borderRadius: 6,
    paddingRight: 7,
    paddingLeft: 7,
    borderColor: {
      'default': 'rgba(62, 68, 78, 0.18)',
      ':focus': 'rgba(45, 49, 57, 0.52)',
    },
    backgroundColor: 'rgba(255, 255, 255, 0.76)',
    fontSize: 11,
    lineHeight: '16px',
    boxShadow: {
      'default': 'inset 0 1px 2px rgba(25, 30, 38, 0.04)',
      ':focus': '0 0 0 2px rgba(0, 96, 204, 0.72)',
    },
  },
})
