import * as stylex from '@stylexjs/stylex'

export const demoStyles = stylex.create({
  page: {
    boxSizing: 'border-box',
    display: 'grid',
    width: '100vw',
    height: '100vh',
    minWidth: 0,
    minHeight: 0,
    placeItems: 'center',
    overflow: 'hidden',
    margin: 0,
    padding: {
      'default': 24,
      '@media (max-width: 720px)': 0,
    },
    backgroundColor: 'rgb(229 233 238)',
    backgroundImage: 'linear-gradient(135deg, rgb(242 245 249), rgb(222 228 235))',
  },
  workspaceFrame: {
    width: {
      'default': 'min(1180px, 100%)',
      '@media (max-width: 720px)': '100%',
    },
    height: {
      'default': 'min(760px, 100%)',
      '@media (max-width: 720px)': '100%',
    },
    minHeight: 0,
    overflow: 'hidden',
    borderColor: 'rgb(48 60 75 / 16%)',
    borderStyle: 'solid',
    borderWidth: {
      'default': 1,
      '@media (max-width: 720px)': 0,
    },
    borderRadius: {
      'default': 10,
      '@media (max-width: 720px)': 0,
    },
    backgroundColor: 'white',
    boxShadow: {
      'default': '0 32px 80px -36px rgb(27 39 54 / 40%), 0 8px 24px -16px rgb(27 39 54 / 20%)',
      '@media (max-width: 720px)': 'none',
    },
  },
})
