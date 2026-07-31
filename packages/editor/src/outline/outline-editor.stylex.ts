import * as stylex from '@stylexjs/stylex'

const colors = {
  gray100: 'oklch(0.967 0.003 264.542)',
  gray200: 'oklch(0.928 0.006 264.531)',
  gray500: 'oklch(0.551 0.027 264.364)',
  gray700: 'oklch(0.373 0.034 259.733)',
  gray900: 'oklch(0.21 0.034 264.665)',
} as const

export const outlineEditorStyles = stylex.create({
  focusNavigation: {
    display: 'flex',
    minHeight: 34,
    alignItems: 'center',
    gap: 8,
    paddingBlock: 3,
    paddingInline: 12,
  },
  backButton: {
    display: 'grid',
    width: 28,
    height: 28,
    flex: '0 0 auto',
    alignItems: 'center',
    justifyItems: 'center',
    borderWidth: 0,
    borderRadius: 6,
    padding: 0,
    backgroundColor: {
      'default': 'transparent',
      ':hover': colors.gray100,
      ':active': colors.gray200,
    },
    color: colors.gray700,
    cursor: 'default',
    outline: 'none',
    boxShadow: {
      'default': 'none',
      ':focus-visible': `0 0 0 2px ${colors.gray900}`,
    },
  },
  breadcrumbs: {
    display: 'flex',
    minWidth: 0,
    alignItems: 'center',
    gap: 6,
    flex: 1,
    color: colors.gray500,
    fontSize: 13,
  },
  focusLabel: {
    overflow: 'hidden',
    color: colors.gray700,
    fontWeight: 600,
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  collapseButton: {
    minHeight: 28,
    flex: '0 0 auto',
    borderColor: colors.gray200,
    borderStyle: 'solid',
    borderWidth: 1,
    borderRadius: 6,
    paddingBlock: 3,
    paddingInline: 9,
    backgroundColor: {
      'default': 'transparent',
      ':hover': colors.gray100,
      ':active': colors.gray200,
    },
    color: colors.gray700,
    cursor: 'default',
    fontSize: 12,
    fontWeight: 600,
    outline: 'none',
    boxShadow: {
      'default': 'none',
      ':focus-visible': `0 0 0 2px ${colors.gray900}`,
    },
  },
})
