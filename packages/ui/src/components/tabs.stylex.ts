import * as stylex from '@stylexjs/stylex'
import { uiColors, uiMotion } from '../theme.stylex'

export const tabsStyles = stylex.create({
  list: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 2,
    borderColor: 'rgba(72, 80, 93, 0.14)',
    borderStyle: 'solid',
    borderWidth: 1,
    borderRadius: 9,
    padding: 2,
    backgroundColor: 'rgba(82, 86, 94, 0.07)',
    boxShadow: 'inset 0 1px 2px rgba(25, 30, 38, 0.05)',
  },
  trigger: {
    minHeight: 28,
    borderWidth: 0,
    borderRadius: 7,
    paddingRight: 12,
    paddingLeft: 12,
    backgroundColor: 'transparent',
    color: uiColors.textMuted,
    cursor: 'default',
    fontSize: 12,
    fontWeight: 550,
    outline: 'none',
    transitionDuration: uiMotion.duration,
    transitionProperty: 'background-color, color, box-shadow',
    transitionTimingFunction: uiMotion.easing,
    boxShadow: {
      'default': 'none',
      ':focus-visible': `0 0 0 2px ${uiColors.focus}`,
    },
  },
  selected: {
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    color: uiColors.text,
    boxShadow: '0 1px 4px rgba(28, 30, 35, 0.14), 0 0 0 0.5px rgba(62, 66, 74, 0.16), inset 0 1px rgba(255, 255, 255, 0.9)',
  },
})
