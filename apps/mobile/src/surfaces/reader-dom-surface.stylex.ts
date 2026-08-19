import * as stylex from '@stylexjs/stylex'

const colors = {
  alertBackground: '#F8E4DE',
  alertBorder: '#E7B7A8',
  alertText: '#B3261E',
  background: '#FFFFFF',
} as const

export const readerDomSurfaceStyles = stylex.create({
  alert: {
    flexShrink: 0,
    borderBottomColor: colors.alertBorder,
    borderBottomStyle: 'solid',
    borderBottomWidth: 1,
    paddingBlock: 8,
    paddingInline: 12,
    backgroundColor: colors.alertBackground,
    color: colors.alertText,
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
    backgroundColor: colors.background,
  },
})
