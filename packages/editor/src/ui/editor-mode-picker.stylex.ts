import * as stylex from '@stylexjs/stylex'

const colors = {
  active: 'rgba(60, 60, 67, 0.1)',
  focus: 'rgba(60, 60, 67, 0.42)',
  group: 'rgba(60, 60, 67, 0.07)',
  hover: 'rgba(60, 60, 67, 0.06)',
  hoverBorder: 'rgba(60, 60, 67, 0.18)',
  hoverText: 'rgba(28, 28, 30, 0.92)',
  text: 'rgba(60, 60, 67, 0.76)',
} as const

export const editorModePickerStyles = stylex.create({
  overlay: {
    position: 'absolute',
    zIndex: 2,
    inset: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    pointerEvents: 'none',
  },
  panel: {
    display: 'flex',
    maxWidth: '100%',
    gap: 12,
    pointerEvents: 'none',
  },
  button: {
    display: 'flex',
    width: 128,
    height: 128,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'column',
    gap: 12,
    borderColor: {
      'default': colors.group,
      ':hover': colors.hoverBorder,
      ':active': colors.hoverBorder,
    },
    borderStyle: 'solid',
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    backgroundColor: {
      'default': '#ffffff',
      ':hover': colors.hover,
      ':active': colors.active,
    },
    color: {
      'default': colors.text,
      ':hover': colors.hoverText,
      ':active': colors.hoverText,
    },
    cursor: 'pointer',
    fontSize: 13,
    fontWeight: 520,
    letterSpacing: 0,
    outlineColor: {
      'default': 'transparent',
      ':focus-visible': colors.focus,
    },
    outlineOffset: 1,
    outlineStyle: 'solid',
    outlineWidth: 2,
    pointerEvents: 'auto',
    transitionDuration: {
      'default': '80ms',
      '@media (prefers-reduced-motion: reduce)': '0ms',
    },
    transitionProperty: 'background-color, border-color, color',
  },
  icon: {
    width: 32,
    height: 32,
  },
  label: {
    fontSize: 14,
    fontWeight: 560,
    lineHeight: '20px',
  },
})
