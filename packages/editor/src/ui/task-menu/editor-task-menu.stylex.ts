import * as stylex from '@stylexjs/stylex'

export const taskMenuStyles = stylex.create({
  trigger: {
    width: 26,
    height: 26,
    minWidth: 26,
    minHeight: 26,
    borderRadius: 7,
    padding: 0,
    backgroundColor: {
      'default': 'transparent',
      ':hover': 'rgba(255, 255, 255, 0.66)',
      ':active': 'rgba(225, 230, 238, 0.8)',
    },
    color: 'rgba(48, 52, 59, 0.56)',
    cursor: 'default',
    opacity: {
      'default': 0,
      ':is([data-visible="true"])': 1,
      '@media (hover: none)': 1,
    },
    pointerEvents: {
      'default': 'none',
      ':is([data-visible="true"])': 'auto',
      '@media (hover: none)': 'auto',
    },
  },
})
