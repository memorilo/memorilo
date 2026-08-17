import * as stylex from '@stylexjs/stylex'

export const readerDomSurfaceStyles = stylex.create({
  alert: {
    flexShrink: 0,
    borderBottomColor: '#f0c7c2',
    borderBottomStyle: 'solid',
    borderBottomWidth: 1,
    paddingBlock: 8,
    paddingInline: 12,
    backgroundColor: '#fff1f0',
    color: '#9f1c1c',
    fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
    fontSize: 13,
    lineHeight: '18px',
  },
  root: {
    display: 'flex',
    width: '100%',
    height: '100vh',
    minWidth: 0,
    minHeight: 0,
    flexDirection: 'column',
    backgroundColor: '#ffffff',
  },
})
