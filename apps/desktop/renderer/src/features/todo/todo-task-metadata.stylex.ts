import * as stylex from '@stylexjs/stylex'

const colors = {
  danger: 'rgb(190, 55, 55)',
  dangerDark: 'rgb(232, 126, 126)',
  textMuted: 'rgba(48, 52, 59, 0.62)',
  textQuiet: 'rgba(48, 52, 59, 0.46)',
} as const

export const todoTaskMetadataStyles = stylex.create({
  metadata: {
    display: 'flex',
    minWidth: 0,
    flexDirection: 'column',
    alignItems: 'flex-end',
    gap: 1,
    flex: '0 0 auto',
    fontVariantNumeric: 'tabular-nums',
    lineHeight: '15px',
    whiteSpace: 'nowrap',
  },
  metadataCompact: {
    lineHeight: '14px',
  },
  due: {
    overflow: 'hidden',
    maxWidth: '100%',
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: 600,
    textOverflow: 'ellipsis',
  },
  dueCompact: {
    fontSize: 10,
  },
  overdue: {
    color: {
      'default': colors.danger,
      '@media (prefers-color-scheme: dark)': colors.dangerDark,
    },
  },
  elapsed: {
    color: colors.textQuiet,
    fontSize: 10,
    fontWeight: 500,
  },
  elapsedDefault: {
    fontSize: 11,
    fontWeight: 550,
  },
})
