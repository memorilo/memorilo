import * as stylex from '@stylexjs/stylex'
import { uiColors } from '../theme.stylex'

export const textFieldStyles = stylex.create({
  input: {
    'boxSizing': 'border-box',
    'width': '100%',
    'height': 36,
    'minWidth': 0,
    'borderColor': {
      'default': uiColors.fieldBorder,
      ':focus': uiColors.focus,
      ':invalid': uiColors.danger,
    },
    'borderStyle': 'solid',
    'borderWidth': 1,
    'borderRadius': 7,
    'paddingRight': 10,
    'paddingLeft': 10,
    'backgroundColor': {
      default: uiColors.fieldBackground,
    },
    'color': uiColors.text,
    'fontSize': 13,
    'outline': 'none',
    'boxShadow': {
      'default': 'inset 0 1px 2px rgba(25, 30, 38, 0.05)',
      ':focus': `0 0 0 2px ${uiColors.focus}`,
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
      'default': uiColors.fieldBorder,
      ':focus': uiColors.focus,
    },
    backgroundColor: uiColors.fieldBackgroundCompact,
    fontSize: 11,
    lineHeight: '16px',
    boxShadow: {
      'default': 'inset 0 1px 2px rgba(25, 30, 38, 0.04)',
      ':focus': `0 0 0 2px ${uiColors.focus}`,
    },
  },
})
