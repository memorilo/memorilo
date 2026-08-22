import * as stylex from '@stylexjs/stylex'

const colors = {
  canvas: '#ffffff',
  gray500: 'oklch(0.551 0.027 264.364)',
} as const

export const editorShellStyles = stylex.create({
  root: {
    display: 'flex',
    width: '100%',
    minHeight: 0,
    flex: 1,
    flexDirection: 'column',
    backgroundColor: colors.canvas,
  },
  rootEmbedded: {
    flex: '0 0 auto',
    minHeight: 'auto',
    overflow: 'visible',
  },
  rootEmbeddedEmpty: {
    minHeight: 'inherit',
  },
  loading: {
    display: 'grid',
    minHeight: 120,
    placeItems: 'center',
    color: colors.gray500,
    fontSize: 13,
  },
})
