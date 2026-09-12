import { uiColors } from '@memorilo/ui/theme.stylex'
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
    borderColor: uiColors.border,
    borderStyle: 'solid',
    borderWidth: uiColors.controlStroke,
    borderRadius: uiColors.controlRadius,
    paddingRight: 11,
    paddingLeft: 11,
    backgroundColor: {
      'default': uiColors.controlBackground,
      ':hover': uiColors.controlHover,
      ':active': uiColors.controlPressed,
      ':disabled': uiColors.surfaceSunken,
    },
    backgroundImage: uiColors.controlBackgroundImage,
    color: uiColors.text,
    boxShadow: uiColors.controlShadow,
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
    color: uiColors.textMuted,
    fontSize: 11,
    letterSpacing: 0,
    lineHeight: '16px',
  },
})
