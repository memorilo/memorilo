import * as stylex from '@stylexjs/stylex'

export const databaseSettingsStyles = stylex.create({
  actions: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 8,
    padding: 14,
  },
  button: {
    display: 'inline-flex',
    minHeight: 32,
    alignItems: 'center',
    gap: 7,
    borderColor: 'rgba(80, 87, 98, 0.2)',
    borderStyle: 'solid',
    borderWidth: 1,
    borderRadius: 7,
    paddingRight: 11,
    paddingLeft: 11,
    backgroundColor: {
      'default': 'rgba(255, 255, 255, 0.7)',
      ':hover': 'rgba(255, 255, 255, 0.94)',
      ':active': 'rgba(236, 240, 247, 0.9)',
      ':disabled': 'rgba(220, 224, 231, 0.55)',
    },
    color: 'rgba(26, 28, 32, 0.9)',
    fontSize: 12,
    fontWeight: 600,
    letterSpacing: 0,
    cursor: {
      'default': 'default',
      ':disabled': 'not-allowed',
    },
  },
  status: {
    marginTop: 0,
    marginRight: 14,
    marginBottom: 12,
    marginLeft: 14,
    color: 'rgba(42, 45, 52, 0.68)',
    fontSize: 11,
    letterSpacing: 0,
    lineHeight: '16px',
  },
})
