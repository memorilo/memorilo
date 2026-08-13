import * as stylex from '@stylexjs/stylex'

export const noteTheme = stylex.defineVars({
  canvas: '#ffffff',
  chromeText: 'rgba(30, 29, 32, 0.86)',
  chromeTextMuted: 'rgba(48, 46, 51, 0.66)',
  chromeTextQuiet: 'rgba(48, 46, 51, 0.5)',
  focus: 'rgba(41, 97, 194, 0.85)',
  inspector: 'rgba(248, 249, 251, 0.74)',
  selectedPressed: 'rgba(76, 84, 96, 0.15)',
  success: 'rgb(52, 145, 80)',
  warning: 'rgb(198, 119, 28)',
})
export const noteSharedStyles = stylex.create({
  statusPage: {
    display: 'flex',
    width: '100%',
    height: '100%',
    minWidth: 0,
    minHeight: 0,
    boxSizing: 'border-box',
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 56,
    backgroundColor: noteTheme.canvas,
    color: noteTheme.chromeText,
  },
  statusMessage: {
    margin: 0,
    color: noteTheme.chromeTextMuted,
    fontSize: 13,
    fontWeight: 500,
    letterSpacing: 0,
    lineHeight: '18px',
  },
  errorMessage: {
    maxWidth: 'min(520px, calc(100% - 48px))',
    color: 'rgb(151, 45, 45)',
    textAlign: 'center',
  },
})
