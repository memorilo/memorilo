import * as stylex from '@stylexjs/stylex'
import { shelfTheme } from '../shelf-shared.stylex'

export const shelfSourceRemoveStyles = stylex.create({
  destructiveGlyph: {
    display: 'grid',
    width: 46,
    height: 46,
    alignItems: 'center',
    justifyItems: 'center',
    marginBottom: 13,
    borderRadius: 14,
    backgroundColor: 'rgba(198, 48, 48, 0.1)',
    color: shelfTheme.danger,
  },
  confirmTitle: {
    margin: 0,
    fontSize: 18,
    fontWeight: 670,
    letterSpacing: 0,
    lineHeight: '23px',
  },
  confirmText: {
    maxWidth: 320,
    marginTop: 8,
    marginRight: 0,
    marginBottom: 20,
    marginLeft: 0,
    color: shelfTheme.textMuted,
    fontSize: 12,
    lineHeight: '18px',
  },
  confirmActions: {
    display: 'grid',
    width: '100%',
    gridTemplateColumns: '1fr 1fr',
    gap: 8,
  },
  destructiveButton: {
    minHeight: 36,
    borderWidth: 0,
    borderRadius: 11,
    paddingRight: 14,
    paddingLeft: 14,
    backgroundColor: {
      'default': shelfTheme.danger,
      ':hover': 'rgb(181, 40, 40)',
      ':active': 'rgb(158, 32, 32)',
      ':disabled': 'rgba(198, 48, 48, 0.52)',
    },
    color: 'white',
    cursor: 'default',
    fontSize: 13,
    fontWeight: 600,
    outline: 'none',
    boxShadow: {
      'default': '0 4px 11px rgba(157, 29, 29, 0.18), inset 0 1px rgba(255, 255, 255, 0.2)',
      ':focus-visible': `0 0 0 2px ${shelfTheme.focus}`,
    },
  },
})
