import * as stylex from '@stylexjs/stylex'

export const imageOcclusionReviewStyles = stylex.create({
  root: {
    position: 'relative',
    width: '100%',
    height: 'clamp(280px, 58vh, 620px)',
    minHeight: 0,
    overflow: 'hidden',
    borderWidth: 1,
    borderStyle: 'solid',
    borderColor: 'rgb(28 33 42 / 12%)',
    borderRadius: 6,
    backgroundColor: '#e7e9ed',
    boxShadow: '0 10px 30px rgb(24 29 38 / 8%)',
  },
  status: {
    position: 'absolute',
    inset: 0,
    display: 'grid',
    placeItems: 'center',
    color: 'rgb(45 50 58 / 62%)',
    fontSize: 12,
    letterSpacing: 0,
  },
  error: {
    color: 'rgb(176 54 50)',
  },
  spinner: {
    'animationName': stylex.keyframes({
      to: { transform: 'rotate(360deg)' },
    }),
    'animationDuration': '800ms',
    'animationIterationCount': 'infinite',
    'animationTimingFunction': 'linear',
    '@media (prefers-reduced-motion: reduce)': {
      animationName: 'none',
    },
  },
})
