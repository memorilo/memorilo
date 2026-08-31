import * as stylex from '@stylexjs/stylex'

/** Base document classes for the standalone spreadsheet demo. */
export const demoGlobalStyles = stylex.create({
  document: {
    width: '100%',
    height: '100%',
  },
  body: {
    width: '100%',
    height: '100%',
    margin: 0,
  },
  root: {
    width: '100%',
    height: '100%',
  },
  controls: {
    boxSizing: 'border-box',
    fontFamily: 'inherit',
  },
})
