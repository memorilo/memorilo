import * as stylex from '@stylexjs/stylex'

const colors = {
  canvas: '#ffffff',
  gray100: 'oklch(0.967 0.003 264.542)',
  gray200: 'oklch(0.928 0.006 264.531)',
  gray500: 'oklch(0.551 0.027 264.364)',
  gray900: 'oklch(0.21 0.034 264.665)',
} as const

export const editorRouteStyles = stylex.create({
  page: {
    display: 'flex',
    width: '100%',
    height: '100vh',
    minHeight: 0,
    overflow: 'hidden',
    flexDirection: 'column',
  },
  toolbar: {
    display: 'flex',
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'flex-end',
    borderBottomColor: colors.gray200,
    borderBottomStyle: 'solid',
    borderBottomWidth: 1,
    paddingBlock: 6,
    paddingInline: 12,
    backgroundColor: colors.canvas,
  },
  modeGroup: {
    display: 'inline-flex',
    gap: 2,
    borderColor: colors.gray200,
    borderStyle: 'solid',
    borderWidth: 1,
    borderRadius: 8,
    padding: 2,
    backgroundColor: colors.gray100,
  },
  modeButton: {
    minHeight: 32,
    borderWidth: 0,
    borderRadius: 6,
    paddingBlock: 5,
    paddingInline: 11,
    backgroundColor: {
      'default': 'transparent',
      ':hover': colors.canvas,
      ':active': colors.gray200,
    },
    color: colors.gray500,
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 600,
    outline: 'none',
    boxShadow: {
      'default': 'none',
      ':focus-visible': `0 0 0 2px ${colors.gray900}`,
    },
    transitionDuration: {
      'default': '100ms',
      '@media (prefers-reduced-motion: reduce)': '0ms',
    },
    transitionProperty: 'background-color, color, box-shadow',
    transitionTimingFunction: 'ease-out',
  },
  modeButtonSelected: {
    backgroundColor: colors.canvas,
    color: colors.gray900,
    boxShadow: '0 1px 2px rgb(0 0 0 / 8%)',
  },
})
