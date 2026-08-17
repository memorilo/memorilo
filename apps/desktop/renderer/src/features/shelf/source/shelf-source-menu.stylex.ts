import * as stylex from '@stylexjs/stylex'
import { shelfTheme } from '../shelf-shared.stylex'

export const shelfSourceMenuStyles = stylex.create({
  sourceMenu: {
    display: 'flex',
    width: 286,
    maxHeight: 390,
    minHeight: 0,
    overflow: 'hidden',
    overflowX: 'hidden',
    overflowY: 'hidden',
    flexDirection: 'column',
  },
  sourceMenuScroll: {
    minHeight: 0,
    maxHeight: 270,
    overflowY: 'auto',
    overscrollBehavior: 'contain',
  },
  sourceMenuItem: {
    display: 'grid',
    width: '100%',
    minHeight: 38,
    minWidth: 0,
    alignItems: 'center',
    gridTemplateColumns: '18px minmax(0, 1fr) 18px',
    gap: 7,
    borderWidth: 0,
    borderRadius: 9,
    paddingTop: 5,
    paddingRight: 8,
    paddingBottom: 5,
    paddingLeft: 8,
    backgroundColor: {
      'default': 'transparent',
      ':hover': 'rgba(62, 72, 87, 0.08)',
      ':active': 'rgba(62, 72, 87, 0.14)',
    },
    color: shelfTheme.text,
    cursor: 'default',
    fontSize: 13,
    outline: 'none',
    textAlign: 'left',
    boxShadow: {
      'default': 'none',
      ':focus-visible': `inset 0 0 0 2px ${shelfTheme.focus}`,
    },
  },
  sourceMenuItemSelected: {
    backgroundColor: 'rgba(0, 113, 227, 0.1)',
    color: 'rgb(0, 94, 190)',
  },
  sourceMenuLabel: {
    display: 'flex',
    minWidth: 0,
    overflow: 'hidden',
    flexDirection: 'column',
    lineHeight: '17px',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
})
