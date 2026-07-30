import * as stylex from '@stylexjs/stylex'

export const pagesRouteStyles = stylex.create({
  page: {
    display: 'flex',
    width: '100%',
    height: '100%',
    minWidth: 0,
    minHeight: 0,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 56,
    backgroundColor: '#ffffff',
    color: 'rgba(30, 29, 32, 0.86)',
  },
  emptyState: {
    display: 'flex',
    alignItems: 'center',
    flexDirection: 'column',
    gap: 10,
    color: 'rgba(48, 46, 51, 0.52)',
    userSelect: 'none',
  },
  emptyIcon: {
    width: 28,
    height: 28,
    color: 'rgba(48, 46, 51, 0.38)',
  },
  emptyLabel: {
    margin: 0,
    fontSize: 13,
    fontWeight: 500,
    letterSpacing: 0,
    lineHeight: '18px',
  },
})
