import * as stylex from '@stylexjs/stylex'

const materialize = stylex.keyframes({
  from: { filter: 'blur(0.6px)', opacity: 0 },
  to: { filter: 'blur(0)', opacity: 1 },
})

export const mathClozeMenuStyles = stylex.create({
  toolbar: {
    position: 'fixed',
    zIndex: 60,
    display: 'inline-flex',
    boxSizing: 'border-box',
    alignItems: 'center',
    borderColor: {
      'default': 'rgb(255 255 255 / 82%)',
      '@media (prefers-contrast: more)': '#52677d',
    },
    borderStyle: 'solid',
    borderWidth: 1,
    borderRadius: 10,
    padding: 3,
    backgroundColor: {
      'default': 'rgb(245 248 251 / 82%)',
      '@media (prefers-reduced-transparency: reduce)': '#f4f7f9',
      '@media (prefers-contrast: more)': '#ffffff',
    },
    backdropFilter: {
      'default': 'blur(14px) saturate(155%)',
      '@media (prefers-reduced-transparency: reduce)': 'none',
    },
    boxShadow: {
      'default': '0 8px 20px -14px rgb(24 39 54 / 48%), inset 0 1px 0 rgb(255 255 255 / 96%), inset 0 -1px 0 rgb(72 94 116 / 9%)',
      '@media (prefers-contrast: more)': '0 0 0 1px #ffffff, 0 0 0 2px #52677d',
    },
    animationDuration: '150ms',
    animationName: {
      'default': materialize,
      '@media (prefers-reduced-motion: reduce)': 'none',
    },
    animationTimingFunction: 'cubic-bezier(0.23, 1, 0.32, 1)',
    transformOrigin: 'var(--math-cloze-transform-origin)',
  },
  button: {
    display: 'inline-flex',
    minHeight: 28,
    alignItems: 'center',
    gap: 6,
    borderWidth: 0,
    borderRadius: 7,
    paddingBlock: 5,
    paddingInline: 9,
    backgroundColor: {
      'default': 'transparent',
      ':hover': 'rgb(255 255 255 / 72%)',
      ':active': 'rgb(227 238 247 / 84%)',
    },
    boxShadow: {
      'default': 'none',
      ':hover': 'inset 0 0 0 1px rgb(255 255 255 / 78%), 0 2px 6px rgb(28 47 65 / 10%)',
      ':focus-visible': '0 0 0 2px rgb(68 132 198 / 42%)',
    },
    color: {
      'default': '#315d84',
      ':hover': '#174e7f',
    },
    cursor: 'pointer',
    fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    fontSize: 12.5,
    fontWeight: 650,
    letterSpacing: '0.01em',
    lineHeight: 1,
    outline: 'none',
    transform: {
      'default': 'scale(1)',
      ':active': 'scale(0.96)',
    },
    transitionDuration: {
      'default': '120ms',
      '@media (prefers-reduced-motion: reduce)': '0ms',
    },
    transitionProperty: 'background-color, box-shadow, color, transform',
    transitionTimingFunction: 'cubic-bezier(0.23, 1, 0.32, 1)',
  },
  icon: {
    color: '#4f78a6',
    flexShrink: 0,
  },
})
