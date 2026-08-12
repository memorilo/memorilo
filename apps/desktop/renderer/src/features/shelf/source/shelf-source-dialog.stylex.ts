import * as stylex from '@stylexjs/stylex'

export const shelfSourceDialogStyles = stylex.create({
  sheetLayer: {
    position: 'fixed',
    zIndex: 100,
    inset: 0,
    display: 'grid',
    alignItems: 'center',
    justifyItems: 'center',
  },
  sheetScrim: {
    position: 'absolute',
    inset: 0,
    width: '100%',
    height: '100%',
    borderWidth: 0,
    padding: 0,
    backgroundColor: 'rgba(24, 27, 33, 0.12)',
  },
})
