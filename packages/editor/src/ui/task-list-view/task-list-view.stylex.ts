import * as stylex from '@stylexjs/stylex'

const tokens = {
  accent: 'oklch(0.623 0.214 259.815)',
  border: 'oklch(0.707 0.022 261.325)',
  done: 'oklch(0.623 0.214 259.815)',
  muted: 'oklch(0.551 0.027 264.364)',
} as const

const pulse = stylex.keyframes({
  '0%': { opacity: 0.45, transform: 'scale(0.8)' },
  '50%': { opacity: 1, transform: 'scale(1)' },
  '100%': { opacity: 0.45, transform: 'scale(0.8)' },
})

export const taskStyles = stylex.create({
  control: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxSizing: 'border-box',
    width: 16,
    height: 16,
    margin: 0,
    padding: 0,
    borderWidth: 1.5,
    borderStyle: 'solid',
    borderColor: {
      'default': tokens.border,
      ':is([data-status="doing"])': tokens.accent,
      ':is([data-status="done"])': tokens.done,
    },
    borderRadius: '50%',
    backgroundColor: {
      'default': 'transparent',
      ':is([data-status="done"])': tokens.done,
    },
    color: '#ffffff',
    cursor: 'pointer',
    outline: 'none',
    transitionDuration: '150ms',
    transitionProperty: 'background-color, border-color, box-shadow',
    transitionTimingFunction: 'cubic-bezier(0.4, 0, 0.2, 1)',
    boxShadow: {
      'default': 'none',
      ':focus-visible': `0 0 0 2px ${tokens.accent}`,
    },
  },
  glyph: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    height: '100%',
  },
  doingDot: {
    width: 6,
    height: 6,
    borderRadius: '50%',
    backgroundColor: tokens.accent,
    animationName: pulse,
    animationDuration: '1.4s',
    animationIterationCount: 'infinite',
    animationTimingFunction: 'ease-in-out',
  },
  time: {
    display: 'inline-flex',
    alignItems: 'center',
    height: '1lh',
    color: tokens.muted,
    fontSize: 12,
    fontVariantNumeric: 'tabular-nums',
    userSelect: 'none',
    whiteSpace: 'nowrap',
    pointerEvents: 'none',
  },
  timeDoing: {
    color: tokens.accent,
  },
  meta: {
    position: 'absolute',
    top: -3,
    right: 0,
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    minHeight: 26,
    userSelect: 'none',
  },
})
