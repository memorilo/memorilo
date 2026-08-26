import * as stylex from '@stylexjs/stylex'

const colors = {
  controlHover: 'var(--ui-control-hover, rgba(0, 122, 255, 0.1))',
  controlPressed: 'var(--ui-control-pressed, rgba(0, 122, 255, 0.16))',
  focus: 'var(--ui-focus, rgba(0, 122, 255, 0.72))',
  textMuted: 'var(--ui-text-muted, rgba(48, 52, 59, 0.56))',
} as const

export const todoTaskActionStyles = stylex.create({
  shell: {
    position: 'relative',
    flex: '0 0 auto',
  },
  summary: {
    display: 'grid',
    width: 28,
    height: 28,
    placeItems: 'center',
    borderWidth: 0,
    borderRadius: 'var(--ui-control-radius, 5px)',
    padding: 0,
    backgroundColor: {
      'default': 'transparent',
      ':hover': colors.controlHover,
      ':active': colors.controlPressed,
    },
    color: colors.textMuted,
    cursor: 'default',
    listStyle: 'none',
    outline: 'none',
    boxShadow: {
      'default': 'none',
      ':focus-visible': `0 0 0 2px ${colors.focus}`,
    },
  },
  summaryCompact: {
    width: 18,
    height: 18,
    borderRadius: 'var(--ui-control-radius, 5px)',
    backgroundColor: {
      'default': 'transparent',
      ':hover': colors.controlHover,
      ':active': colors.controlPressed,
    },
    color: colors.textMuted,
  },
  scheduleSummary: {
    width: 'auto',
    minWidth: 0,
    maxWidth: 220,
    height: 'auto',
    minHeight: 28,
    justifyContent: 'flex-end',
    paddingInline: 4,
    backgroundColor: {
      'default': 'transparent',
      ':hover': colors.controlHover,
      ':active': colors.controlPressed,
    },
  },
})
