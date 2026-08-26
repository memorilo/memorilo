import * as stylex from '@stylexjs/stylex'
import { uiColors } from '../theme.stylex'

export const segmentedControlStyles = stylex.create({
  root: {
    display: 'flex',
    width: '100%',
    maxWidth: 184,
    height: 30,
    alignItems: 'stretch',
    gap: 2,
    borderColor: uiColors.fieldBorder,
    borderStyle: 'solid',
    borderWidth: 1,
    borderRadius: uiColors.controlRadius,
    padding: 2,
    backgroundColor: uiColors.controlHover,
    boxShadow: uiColors.controlShadow,
  },
  item: {
    position: 'relative',
    display: 'grid',
    minWidth: 0,
    flex: 1,
    placeItems: 'center',
    borderWidth: 0,
    borderRadius: uiColors.controlRadius,
    paddingRight: 7,
    paddingLeft: 7,
    backgroundColor: 'transparent',
    color: uiColors.text,
    cursor: 'default',
    fontSize: 11,
    fontWeight: 550,
    lineHeight: '24px',
    outline: 'none',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    boxShadow: {
      'default': 'none',
      ':focus-visible': `0 0 0 2px ${uiColors.focus}`,
    },
  },
  selected: {
    backgroundColor: uiColors.surfaceRaised,
    boxShadow: uiColors.controlShadow,
  },
})
