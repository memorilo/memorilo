import * as stylex from '@stylexjs/stylex'

export const editorButtonAdapterStyles = stylex.create({
  tooltipTrigger: {
    display: 'block',
  },
  action: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 36,
    minHeight: 36,
    borderWidth: 0,
    borderRadius: 6,
    padding: 8,
    backgroundColor: {
      'default': 'transparent',
      ':hover': 'color-mix(in srgb, currentColor 10%, transparent)',
    },
    color: {
      'default': 'currentColor',
      ':disabled': 'oklch(0.21 0.034 264.665 / 50%)',
    },
    cursor: {
      'default': 'pointer',
      ':disabled': 'default',
    },
    fontSize: 14,
    fontWeight: 500,
    boxShadow: {
      'default': 'none',
      ':focus-visible': '0 0 0 2px currentColor',
    },
    outline: 'none',
    outlineOffset: 0,
    pointerEvents: {
      'default': 'auto',
      ':disabled': 'none',
    },
    transitionDuration: '150ms',
    transitionProperty: 'color, background-color, border-color, outline-color, text-decoration-color, fill, stroke, opacity, box-shadow, transform, translate, scale, rotate, filter, backdrop-filter',
    transitionTimingFunction: 'cubic-bezier(0.4, 0, 0.2, 1)',
  },
  pressed: {
    backgroundColor: 'color-mix(in srgb, currentColor 14%, transparent)',
  },
  tooltipPopup: {
    display: 'flex',
    overflow: 'hidden',
    borderColor: 'color-mix(in srgb, currentColor 22%, transparent)',
    borderStyle: 'solid',
    borderWidth: 1,
    borderRadius: 6,
    paddingBlock: 6,
    paddingInline: 12,
    backgroundColor: 'currentColor',
    boxShadow: '0 1px 2px rgb(0 0 0 / 5%)',
    color: 'Canvas',
    fontSize: 12,
    whiteSpace: 'nowrap',
    transitionDuration: {
      'default': '100ms',
      '@media (prefers-reduced-motion: reduce)': '0ms',
    },
  },
  visuallyHidden: {
    position: 'absolute',
    width: 1,
    height: 1,
    overflow: 'hidden',
    margin: -1,
    borderWidth: 0,
    padding: 0,
    clip: 'rect(0, 0, 0, 0)',
    whiteSpace: 'nowrap',
  },
})
