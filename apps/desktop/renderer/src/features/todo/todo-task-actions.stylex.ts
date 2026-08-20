import * as stylex from '@stylexjs/stylex'

export const todoTaskActionStyles = stylex.create({
  shell: {
    position: 'relative',
    flex: '0 0 auto',
  },
  summary: {
    display: 'grid',
    width: 28,
    height: 28,
    placeItems: 'center',
    borderWidth: 0,
    borderRadius: 5,
    padding: 0,
    backgroundColor: {
      'default': 'transparent',
      ':hover': 'rgba(0, 122, 255, 0.1)',
      ':active': 'rgba(0, 122, 255, 0.16)',
    },
    color: 'rgba(48, 52, 59, 0.56)',
    cursor: 'default',
    listStyle: 'none',
    outline: 'none',
    boxShadow: {
      'default': 'none',
      ':focus-visible': '0 0 0 2px rgba(0, 122, 255, 0.72)',
    },
  },
  summaryCompact: {
    width: 18,
    height: 18,
    borderRadius: 5,
    backgroundColor: {
      'default': 'transparent',
      ':hover': 'rgba(0, 122, 255, 0.1)',
      ':active': 'rgba(0, 122, 255, 0.16)',
    },
    color: 'rgba(60, 60, 67, 0.6)',
  },
  scheduleSummary: {
    width: 'auto',
    minWidth: 0,
    maxWidth: 220,
    height: 'auto',
    minHeight: 28,
    justifyContent: 'flex-end',
    paddingInline: 4,
    backgroundColor: {
      'default': 'transparent',
      ':hover': 'rgba(0, 122, 255, 0.1)',
      ':active': 'rgba(0, 122, 255, 0.16)',
    },
  },
})
