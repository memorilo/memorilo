import * as stylex from '@stylexjs/stylex'

export const taskTimePickerStyles = stylex.create({
  popover: {
    zIndex: 70,
    display: 'grid',
    width: 'min(232px, calc(100vw - 24px))',
    gap: 10,
    boxSizing: 'border-box',
    borderColor: {
      'default': 'rgba(255, 255, 255, 0.86)',
      '@media (prefers-color-scheme: dark)': 'rgba(255, 255, 255, 0.16)',
      '@media (prefers-contrast: more)': 'currentColor',
    },
    borderStyle: 'solid',
    borderWidth: 1,
    borderRadius: 10,
    padding: 10,
    backgroundColor: {
      'default': 'rgba(249, 250, 253, 0.93)',
      '@media (prefers-color-scheme: dark)': 'rgba(31, 34, 41, 0.94)',
      '@media (prefers-reduced-transparency: reduce)': 'rgb(249, 250, 253)',
      '@media (prefers-contrast: more)': 'rgb(255, 255, 255)',
    },
    backdropFilter: {
      'default': 'blur(26px) saturate(150%)',
      '@media (prefers-reduced-transparency: reduce)': 'none',
    },
    boxShadow: {
      'default': '0 18px 48px rgba(31, 38, 48, 0.2), 0 3px 10px rgba(31, 38, 48, 0.1), inset 0 1px rgba(255, 255, 255, 0.9)',
      '@media (prefers-color-scheme: dark)': '0 20px 52px rgba(0, 0, 0, 0.46), 0 3px 12px rgba(0, 0, 0, 0.28), inset 0 1px rgba(255, 255, 255, 0.1)',
    },
    color: {
      'default': 'rgba(25, 27, 31, 0.92)',
      '@media (prefers-color-scheme: dark)': 'rgba(248, 249, 251, 0.94)',
    },
  },
  heading: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    paddingInline: 4,
    fontSize: 12,
    fontWeight: 650,
  },
  closeButton: {
    minWidth: 28,
    minHeight: 28,
    padding: 5,
  },
  input: {
    'width': '100%',
    'height': 34,
    'boxSizing': 'border-box',
    'borderColor': 'rgba(72, 77, 86, 0.16)',
    'borderStyle': 'solid',
    'borderWidth': 1,
    'borderRadius': 8,
    'paddingInline': 9,
    'backgroundColor': 'rgba(255, 255, 255, 0.68)',
    'color': 'inherit',
    'fontSize': 13,
    'fontVariantNumeric': 'tabular-nums',
    'outline': 'none',
    ':focus': { borderColor: 'rgba(67, 112, 255, 0.7)', boxShadow: '0 0 0 2px rgba(67, 112, 255, 0.15)' },
  },
  clearButton: {
    height: 30,
    borderRadius: 7,
    fontSize: 11,
  },
})
