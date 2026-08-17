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
    borderRadius: 7,
    padding: 0,
    backgroundColor: {
      'default': 'transparent',
      ':hover': 'rgba(255, 255, 255, 0.62)',
      ':active': 'rgba(225, 230, 238, 0.78)',
    },
    color: 'rgba(48, 52, 59, 0.56)',
    cursor: 'default',
    listStyle: 'none',
    outline: 'none',
    boxShadow: {
      'default': 'none',
      ':focus-visible': '0 0 0 2px rgba(41, 97, 194, 0.85)',
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
    color: 'rgba(18, 64, 111, 0.58)',
  },
})
