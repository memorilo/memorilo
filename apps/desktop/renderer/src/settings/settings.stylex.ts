import * as stylex from '@stylexjs/stylex'

export const settingsStyles = stylex.create({
  window: {
    position: 'relative',
    display: 'flex',
    width: '100%',
    height: '100%',
    minWidth: 0,
    minHeight: 0,
    overflow: 'hidden',
    flexDirection: 'column',
    backgroundColor: {
      'default': 'rgba(244, 246, 249, 0.82)',
      '@media (prefers-color-scheme: dark)': 'rgba(31, 33, 38, 0.84)',
      '@media (prefers-reduced-transparency: reduce)': 'rgb(244, 246, 249)',
    },
  },
  scrollArea: {
    minHeight: 0,
    overflowY: 'auto',
    flex: 1,
    paddingTop: 28,
    paddingRight: 54,
    paddingBottom: 42,
    paddingLeft: 54,
  },
  content: {
    display: 'flex',
    width: 'min(100%, 480px)',
    flexDirection: 'column',
    gap: 24,
    marginRight: 'auto',
    marginLeft: 'auto',
  },
  sectionTitle: {
    marginTop: 0,
    marginRight: 2,
    marginBottom: 8,
    marginLeft: 2,
    color: {
      'default': 'rgba(50, 53, 60, 0.6)',
      '@media (prefers-color-scheme: dark)': 'rgba(229, 231, 236, 0.6)',
    },
    fontSize: 11,
    fontWeight: 650,
    letterSpacing: 0,
    lineHeight: '16px',
  },
  settingsGroup: {
    borderTopColor: {
      'default': 'rgba(54, 60, 70, 0.13)',
      '@media (prefers-color-scheme: dark)': 'rgba(255, 255, 255, 0.12)',
    },
    borderTopStyle: 'solid',
    borderTopWidth: 1,
    borderBottomColor: {
      'default': 'rgba(54, 60, 70, 0.13)',
      '@media (prefers-color-scheme: dark)': 'rgba(255, 255, 255, 0.12)',
    },
    borderBottomStyle: 'solid',
    borderBottomWidth: 1,
  },
  status: {
    display: 'grid',
    width: '100%',
    height: '100%',
    placeItems: 'center',
    backgroundColor: 'rgba(244, 246, 249, 0.92)',
    color: 'rgba(45, 48, 55, 0.68)',
    fontSize: 12,
    letterSpacing: 0,
  },
  compactPadding: {
    '@media (max-width: 520px)': {
      paddingRight: 28,
      paddingLeft: 28,
    },
  },
})
