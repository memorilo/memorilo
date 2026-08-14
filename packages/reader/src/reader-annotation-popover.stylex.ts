import * as stylex from '@stylexjs/stylex'
import { readerTheme } from './reader-theme.stylex'

const appear = stylex.keyframes({
  from: { opacity: 0, transform: 'translate(-50%, -100%) translateY(3px) scale(0.97)' },
  to: { opacity: 1, transform: 'translate(-50%, -100%) translateY(0) scale(1)' },
})

export const readerAnnotationPopoverStyles = stylex.create({
  popover: {
    position: 'fixed',
    zIndex: 42,
    display: 'flex',
    height: 44,
    maxWidth: 'calc(100vw - 24px)',
    alignItems: 'center',
    gap: 3,
    borderColor: 'rgba(255, 255, 255, 0.82)',
    borderStyle: 'solid',
    borderWidth: 1,
    borderRadius: 22,
    padding: 5,
    backgroundColor: {
      'default': 'rgba(248, 249, 251, 0.88)',
      '@media (prefers-reduced-transparency: reduce)': 'rgb(248, 249, 251)',
    },
    backdropFilter: {
      'default': 'blur(16px) saturate(170%)',
      '@media (prefers-reduced-transparency: reduce)': 'none',
    },
    boxShadow: '0 9px 24px rgba(22, 28, 38, 0.16), 0 1px 4px rgba(22, 28, 38, 0.12)',
    transform: 'translate(-50%, -100%)',
    transformOrigin: '50% calc(100% + 10px)',
    animationDuration: {
      'default': '150ms',
      '@media (prefers-reduced-motion: reduce)': '0ms',
    },
    animationName: appear,
    animationTimingFunction: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
  },
  below: {
    transform: 'translate(-50%, 0)',
    transformOrigin: '50% -10px',
    animationName: 'none',
  },
  tool: {
    'display': 'grid',
    'width': 32,
    'height': 32,
    'flexShrink': 0,
    'alignItems': 'center',
    'justifyItems': 'center',
    'borderColor': 'transparent',
    'borderStyle': 'solid',
    'borderWidth': 1,
    'borderRadius': 16,
    'padding': 0,
    'backgroundColor': {
      'default': 'transparent',
      ':hover': 'rgba(70, 76, 87, 0.08)',
      ':active': 'rgba(70, 76, 87, 0.14)',
    },
    'color': 'rgba(29, 34, 42, 0.88)',
    'cursor': 'default',
    'outline': 'none',
    'transform': {
      'default': 'scale(1)',
      ':active': 'scale(0.94)',
    },
    'transitionDuration': {
      'default': '90ms',
      '@media (prefers-reduced-motion: reduce)': '0ms',
    },
    'transitionProperty': 'background-color, color, transform',
    'transitionTimingFunction': 'ease-out',
    ':focus-visible': {
      boxShadow: `0 0 0 2px ${readerTheme.focus}`,
    },
  },
  toolActive: {
    backgroundColor: 'rgba(0, 113, 227, 0.12)',
    color: readerTheme.accent,
  },
  destructive: {
    color: 'rgb(178, 39, 49)',
  },
  divider: {
    width: 1,
    height: 20,
    flexShrink: 0,
    marginRight: 2,
    marginLeft: 2,
    backgroundColor: readerTheme.separator,
  },
  swatch: {
    width: 22,
    height: 22,
    borderColor: 'rgba(255, 255, 255, 0.94)',
    borderStyle: 'solid',
    borderWidth: 2,
    borderRadius: 11,
    boxShadow: '0 0 0 1px rgba(38, 44, 54, 0.32)',
  },
  colorPalette: {
    display: 'flex',
    alignItems: 'center',
    gap: 5,
  },
  colorButton: {
    'width': 24,
    'height': 24,
    'borderColor': 'rgba(255, 255, 255, 0.9)',
    'borderStyle': 'solid',
    'borderWidth': 2,
    'borderRadius': 12,
    'padding': 0,
    'outline': 'none',
    ':focus-visible': {
      boxShadow: `0 0 0 2px ${readerTheme.focus}`,
    },
  },
  colorSelected: {
    boxShadow: '0 0 0 2px white, 0 0 0 3px rgba(41, 48, 59, 0.55)',
  },
})
