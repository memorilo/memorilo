import * as stylex from '@stylexjs/stylex'

export const readerImageOcclusionOverlayStyles = stylex.create({
  overlay: {
    position: 'absolute',
    zIndex: 5,
    inset: 0,
    width: '100%',
    height: '100%',
    overflow: 'visible',
    pointerEvents: 'none',
  },
})
