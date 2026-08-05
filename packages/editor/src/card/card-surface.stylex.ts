import * as stylex from '@stylexjs/stylex'

export const cardSurfaceStyles = stylex.create({
  root: {
    boxSizing: 'border-box',
    width: '100%',
    minWidth: 0,
    overflow: 'hidden',
    backgroundColor: '#ffffff',
  },
  review: {
    height: 'min(520px, 62vh)',
    minHeight: 280,
    borderRadius: 8,
    boxShadow: 'inset 0 0 0 1px rgb(54 61 71 / 8%)',
  },
  preview: {
    height: 'min(390px, 52vh)',
    minHeight: 220,
  },
})
