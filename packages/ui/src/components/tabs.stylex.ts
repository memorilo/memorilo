import * as stylex from '@stylexjs/stylex'
import { uiColors, uiMotion } from '../theme.stylex'

export const tabsStyles = stylex.create({
  list: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 2,
    borderColor: uiColors.fieldBorder,
    borderStyle: 'solid',
    borderWidth: 1,
    borderRadius: uiColors.controlRadius,
    padding: 2,
    backgroundColor: uiColors.controlHover,
    boxShadow: uiColors.controlShadow,
  },
  trigger: {
    minHeight: 28,
    borderWidth: 0,
    borderRadius: uiColors.controlRadius,
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
    backgroundColor: uiColors.surfaceRaised,
    color: uiColors.text,
    boxShadow: uiColors.controlShadow,
  },
})
