import * as stylex from '@stylexjs/stylex'

const colors = {
  text: 'var(--ui-text, rgba(25, 27, 31, 0.9))',
} as const

export const appTitlebarStyles = stylex.create({
  titlebar: {
    position: 'absolute',
    zIndex: 20,
    top: 0,
    right: 0,
    left: 0,
    width: '100%',
    height: 56,
    backgroundColor: 'var(--ui-chrome-background, transparent)',
    borderBottomColor: 'var(--ui-chrome-border, transparent)',
    borderBottomStyle: 'solid',
    borderBottomWidth: 'var(--ui-chrome-border-width, 0px)',
    color: colors.text,
    userSelect: 'none',
  },
  titlebarPassThrough: {
    pointerEvents: 'none',
  },
  navigationGroup: {
    position: 'absolute',
    top: 10,
    pointerEvents: 'auto',
  },
  trailingGroup: {
    right: 14,
  },
  trailingGroupPlain: {
    padding: 0,
    borderWidth: 0,
    backgroundColor: 'transparent',
    backgroundImage: 'none',
    backdropFilter: 'none',
    boxShadow: 'none',
  },
  trailingGroupWithSidebarAction: {
    right: 58,
  },
  sidebarActionGroup: {
    right: 14,
  },
  leadingSlot: {
    position: 'absolute',
    top: 10,
    right: 14,
    height: 36,
    minWidth: 0,
    pointerEvents: 'auto',
  },
  titleSlot: {
    position: 'absolute',
    top: 11,
    left: '50%',
    display: 'flex',
    width: 'min(40vw, 420px)',
    height: 32,
    minWidth: 0,
    alignItems: 'center',
    justifyContent: 'center',
    pointerEvents: 'auto',
    transform: 'translateX(-50%)',
  },
  titleSlotWide: {
    display: {
      'default': 'flex',
      '@media (max-width: 1050px)': 'none',
    },
  },
  staticTitle: {
    display: 'flex',
    maxWidth: '100%',
    height: 32,
    minWidth: 0,
    alignItems: 'center',
    justifyContent: 'center',
    paddingRight: 10,
    paddingLeft: 10,
  },
  titleText: {
    overflow: 'hidden',
    fontSize: 13,
    fontWeight: 600,
    letterSpacing: 0,
    lineHeight: '18px',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
})
