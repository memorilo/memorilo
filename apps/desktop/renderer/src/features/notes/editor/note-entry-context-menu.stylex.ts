import * as stylex from '@stylexjs/stylex'
import { noteTheme } from './note-shared.stylex'

export const noteEntryContextMenuStyles = stylex.create({
  entryContextMenu: {
    position: 'fixed',
    zIndex: 70,
    width: 168,
    borderColor: 'rgba(48, 51, 58, 0.16)',
    borderStyle: 'solid',
    borderWidth: 1,
    borderRadius: 8,
    padding: 4,
    backgroundColor: {
      'default': 'rgba(250, 251, 253, 0.94)',
      '@media (prefers-reduced-transparency: reduce)': 'rgb(250, 251, 253)',
    },
    backdropFilter: {
      'default': 'blur(18px) saturate(160%)',
      '@media (prefers-reduced-transparency: reduce)': 'none',
    },
    boxShadow: '0 12px 28px rgba(28, 34, 44, 0.18), 0 2px 6px rgba(28, 34, 44, 0.1)',
  },
  entryContextSubmenuTrigger: {
    position: 'relative',
  },
  entryContextSubmenu: {
    position: 'absolute',
    zIndex: 71,
    top: -4,
    left: 'calc(100% + 4px)',
    width: 168,
    borderColor: 'rgba(48, 51, 58, 0.16)',
    borderStyle: 'solid',
    borderWidth: 1,
    borderRadius: 8,
    padding: 4,
    backgroundColor: {
      'default': 'rgba(250, 251, 253, 0.94)',
      '@media (prefers-reduced-transparency: reduce)': 'rgb(250, 251, 253)',
    },
    backdropFilter: {
      'default': 'blur(18px) saturate(160%)',
      '@media (prefers-reduced-transparency: reduce)': 'none',
    },
    boxShadow: '0 12px 28px rgba(28, 34, 44, 0.18), 0 2px 6px rgba(28, 34, 44, 0.1)',
  },
  entryContextSubmenuLeft: {
    right: 'calc(100% + 4px)',
    left: 'auto',
  },
  entryContextMenuItem: {
    display: 'flex',
    width: '100%',
    height: 30,
    alignItems: 'center',
    gap: 8,
    borderWidth: 0,
    borderRadius: 5,
    paddingRight: 8,
    paddingLeft: 8,
    backgroundColor: {
      'default': 'transparent',
      ':hover': 'rgba(0, 113, 227, 0.1)',
      ':active': 'rgba(0, 113, 227, 0.16)',
    },
    color: noteTheme.chromeText,
    cursor: 'default',
    fontSize: 12,
    lineHeight: '17px',
    outline: 'none',
    textDecoration: 'none',
    boxShadow: {
      ':focus-visible': `0 0 0 2px ${noteTheme.focus}`,
    },
  },
  entryContextMenuItemDisabled: {
    backgroundColor: {
      ':hover': 'transparent',
      ':active': 'transparent',
    },
    color: noteTheme.chromeTextQuiet,
  },
  entryContextMenuItemTrailing: {
    marginLeft: 'auto',
  },
})
