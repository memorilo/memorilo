import * as stylex from '@stylexjs/stylex'

export const readerTheme = stylex.defineVars({
  accent: 'rgb(0, 113, 227)',
  canvas: 'rgb(238, 239, 242)',
  chrome: 'rgba(255, 255, 255, 0.88)',
  focus: 'rgba(41, 97, 194, 0.85)',
  separator: 'rgba(49, 48, 53, 0.13)',
  text: 'rgba(27, 27, 30, 0.9)',
  textMuted: 'rgba(48, 46, 51, 0.62)',
})

export const readerSharedStyles = stylex.create({
  primaryTextButton: {
    display: 'flex',
    minHeight: 27,
    alignItems: 'center',
    gap: 5,
    borderWidth: 0,
    borderRadius: 7,
    paddingRight: 10,
    paddingLeft: 10,
    backgroundColor: {
      'default': readerTheme.accent,
      ':hover': 'rgb(0, 103, 211)',
      ':active': 'rgb(0, 92, 192)',
      ':disabled': 'rgba(0, 113, 227, 0.34)',
    },
    color: 'white',
    cursor: {
      'default': 'default',
      ':disabled': 'not-allowed',
    },
    fontSize: 10,
    fontWeight: 650,
    outline: 'none',
  },
  colorYellow: {
    backgroundColor: 'rgb(255, 205, 31)',
  },
  colorGreen: {
    backgroundColor: 'rgb(63, 190, 108)',
  },
  colorBlue: {
    backgroundColor: 'rgb(64, 148, 255)',
  },
  colorPink: {
    backgroundColor: 'rgb(255, 83, 139)',
  },
  colorPurple: {
    backgroundColor: 'rgb(140, 98, 255)',
  },
})
