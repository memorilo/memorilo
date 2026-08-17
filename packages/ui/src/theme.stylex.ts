import * as stylex from '@stylexjs/stylex'

export const uiColors = stylex.defineVars({
  accent: 'rgb(0, 113, 227)',
  accentPressed: 'rgb(0, 91, 187)',
  canvas: 'rgb(250, 250, 249)',
  focus: 'rgba(41, 97, 194, 0.84)',
  text: 'rgba(27, 28, 31, 0.92)',
  textMuted: 'rgba(46, 48, 54, 0.64)',
  textQuiet: 'rgba(55, 57, 63, 0.46)',
})

export const uiMotion = {
  duration: {
    'default': '110ms',
    '@media (prefers-reduced-motion: reduce)': '0ms',
  },
  easing: 'ease-out',
} as const
