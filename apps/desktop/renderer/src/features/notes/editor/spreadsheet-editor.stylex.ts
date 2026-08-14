import * as stylex from '@stylexjs/stylex'

export const spreadsheetEditorStyles = stylex.create({
  root: {
    position: 'relative',
    width: '100%',
    height: '100%',
    minWidth: 0,
    minHeight: 0,
  },
  error: {
    position: 'absolute',
    zIndex: 6,
    top: 94,
    left: '50%',
    maxWidth: 'min(560px, calc(100% - 32px))',
    borderRadius: 8,
    paddingBlock: 8,
    paddingInline: 12,
    backgroundColor: 'rgb(115 28 28 / 94%)',
    boxShadow: '0 8px 24px rgb(42 12 12 / 20%)',
    color: '#ffffff',
    fontSize: 12,
    letterSpacing: 0,
    lineHeight: '17px',
    transform: 'translateX(-50%)',
  },
})
