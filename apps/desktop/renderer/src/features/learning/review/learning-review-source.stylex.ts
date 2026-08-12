import * as stylex from '@stylexjs/stylex'

export const learningReviewSourceStyles = stylex.create({
  sourceStatus: {
    display: 'grid',
    width: '100%',
    minHeight: 280,
    placeItems: 'center',
    color: 'rgba(45, 50, 58, 0.56)',
    fontSize: 12,
    letterSpacing: 0,
  },
  sourceError: {
    color: 'rgb(176, 54, 50)',
  },
})
