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
    borderColor: {
      'default': 'rgba(71, 76, 86, 0.16)',
      '@media (prefers-color-scheme: dark)': 'rgba(255, 255, 255, 0.14)',
    },
    borderStyle: 'solid',
    borderWidth: 1,
    borderRadius: 7,
    padding: 2,
    backgroundColor: {
      'default': 'rgba(82, 86, 94, 0.08)',
      '@media (prefers-color-scheme: dark)': 'rgba(0, 0, 0, 0.18)',
    },
    boxShadow: 'inset 0 1px 2px rgba(25, 30, 38, 0.05)',
  },
  item: {
    position: 'relative',
    display: 'grid',
    minWidth: 0,
    flex: 1,
    placeItems: 'center',
    borderWidth: 0,
    borderRadius: 5,
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
    backgroundColor: {
      'default': 'rgba(255, 255, 255, 0.9)',
      '@media (prefers-color-scheme: dark)': 'rgba(255, 255, 255, 0.16)',
    },
    boxShadow: '0 1px 4px rgba(28, 30, 35, 0.14), 0 0 0 0.5px rgba(62, 66, 74, 0.16), inset 0 1px rgba(255, 255, 255, 0.9)',
  },
})
