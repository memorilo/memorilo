import * as stylex from '@stylexjs/stylex'

const colors = {
  accent: 'rgb(0, 113, 227)',
  danger: 'rgb(176, 45, 45)',
  focus: 'rgba(41, 97, 194, 0.82)',
  text: 'rgba(28, 29, 32, 0.9)',
  textMuted: 'rgba(53, 55, 61, 0.62)',
} as const

export const configurationFieldStyles = stylex.create({
  list: {
    display: 'flex',
    width: '100%',
    flexDirection: 'column',
  },
  row: {
    display: 'grid',
    width: '100%',
    minHeight: 64,
    alignItems: 'center',
    gridTemplateColumns: 'minmax(0, 1fr) minmax(138px, 42%)',
    columnGap: 28,
    paddingTop: 11,
    paddingRight: 2,
    paddingBottom: 11,
    paddingLeft: 2,
    borderBottomColor: {
      'default': 'rgba(57, 62, 70, 0.1)',
      '@media (prefers-color-scheme: dark)': 'rgba(255, 255, 255, 0.1)',
    },
    borderBottomStyle: 'solid',
    borderBottomWidth: 1,
  },
  copy: {
    minWidth: 0,
  },
  label: {
    display: 'block',
    color: {
      'default': colors.text,
      '@media (prefers-color-scheme: dark)': 'rgba(246, 247, 249, 0.9)',
    },
    fontSize: 13,
    fontWeight: 550,
    letterSpacing: 0,
    lineHeight: '18px',
  },
  description: {
    marginTop: 3,
    marginRight: 0,
    marginBottom: 0,
    marginLeft: 0,
    color: {
      'default': colors.textMuted,
      '@media (prefers-color-scheme: dark)': 'rgba(231, 233, 238, 0.6)',
    },
    fontSize: 12,
    letterSpacing: 0,
    lineHeight: '17px',
  },
  controlSlot: {
    display: 'flex',
    minWidth: 0,
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 8,
  },
  input: {
    width: '100%',
    height: 30,
    minWidth: 0,
    borderColor: {
      'default': 'rgba(71, 76, 86, 0.2)',
      '@media (prefers-color-scheme: dark)': 'rgba(255, 255, 255, 0.16)',
      ':focus': colors.focus,
    },
    borderStyle: 'solid',
    borderWidth: 1,
    borderRadius: 6,
    paddingRight: 8,
    paddingLeft: 8,
    backgroundColor: {
      'default': 'rgba(255, 255, 255, 0.78)',
      '@media (prefers-color-scheme: dark)': 'rgba(255, 255, 255, 0.09)',
    },
    color: {
      'default': colors.text,
      '@media (prefers-color-scheme: dark)': 'rgba(246, 247, 249, 0.9)',
    },
    fontSize: 12,
    letterSpacing: 0,
    lineHeight: '18px',
    outline: 'none',
    boxShadow: {
      'default': 'inset 0 1px 2px rgba(25, 30, 38, 0.05)',
      ':focus': '0 0 0 2px rgba(41, 97, 194, 0.14)',
    },
  },
  numberInput: {
    maxWidth: 104,
    textAlign: 'right',
  },
  unit: {
    flex: '0 0 auto',
    color: {
      'default': colors.textMuted,
      '@media (prefers-color-scheme: dark)': 'rgba(231, 233, 238, 0.6)',
    },
    fontSize: 11,
    letterSpacing: 0,
  },
  switch: {
    position: 'relative',
    width: 34,
    height: 20,
    flex: '0 0 34px',
    borderWidth: 0,
    borderRadius: 10,
    padding: 0,
    backgroundColor: {
      'default': 'rgba(83, 87, 96, 0.22)',
      '@media (prefers-color-scheme: dark)': 'rgba(235, 238, 244, 0.24)',
    },
    cursor: 'default',
    outline: 'none',
    boxShadow: {
      'default': 'inset 0 0 0 1px rgba(39, 43, 50, 0.08)',
      ':focus-visible': `0 0 0 2px ${colors.focus}`,
    },
    transform: {
      'default': 'scale(1)',
      ':active': 'scale(0.95)',
    },
    transitionDuration: {
      'default': '120ms',
      '@media (prefers-reduced-motion: reduce)': '0ms',
    },
    transitionProperty: 'background-color, box-shadow, transform',
    transitionTimingFunction: 'ease-out',
  },
  switchOn: {
    backgroundColor: colors.accent,
  },
  switchThumb: {
    position: 'absolute',
    top: 2,
    left: 2,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: 'white',
    boxShadow: '0 1px 3px rgba(24, 28, 35, 0.26)',
    transform: 'translateX(0)',
    transitionDuration: {
      'default': '150ms',
      '@media (prefers-reduced-motion: reduce)': '0ms',
    },
    transitionProperty: 'transform',
    transitionTimingFunction: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
  },
  switchThumbOn: {
    transform: 'translateX(14px)',
  },
  pending: {
    opacity: 0.62,
  },
  error: {
    gridColumn: '1 / -1',
    marginTop: 6,
    marginRight: 0,
    marginBottom: 0,
    marginLeft: 0,
    color: {
      'default': colors.danger,
      '@media (prefers-color-scheme: dark)': 'rgb(255, 142, 142)',
    },
    fontSize: 11,
    letterSpacing: 0,
    lineHeight: '16px',
  },
})
