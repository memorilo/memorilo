import * as stylex from '@stylexjs/stylex'

export const whiteboardEditorStyles = stylex.create({
  root: {
    position: 'relative',
    width: '100%',
    minHeight: 0,
    flex: 1,
    overflow: 'hidden',
    backgroundColor: '#f7f8fa',
  },
  insertEditorButton: {
    display: 'grid',
    width: 32,
    height: 32,
    boxSizing: 'border-box',
    alignItems: 'center',
    justifyItems: 'center',
    flexShrink: 0,
    borderWidth: 0,
    borderRadius: 8,
    padding: 0,
    backgroundColor: {
      'default': 'transparent',
      ':hover': 'rgba(255, 255, 255, 0.62)',
      ':active': 'rgba(73, 82, 98, 0.16)',
    },
    boxShadow: {
      'default': 'none',
      ':focus-visible': '0 0 0 2px rgba(41, 97, 194, 0.85)',
    },
    color: 'rgba(30, 29, 32, 0.86)',
    cursor: 'default',
    outline: 'none',
    transform: {
      'default': 'scale(1)',
      ':active': 'scale(0.95)',
      '@media (prefers-reduced-motion: reduce)': 'none',
    },
    transitionDuration: {
      'default': '100ms',
      '@media (prefers-reduced-motion: reduce)': '0ms',
    },
    transitionProperty: 'background-color, box-shadow, transform',
    transitionTimingFunction: 'ease-out',
  },
  editorEmbed: {
    width: '100%',
    height: '100%',
    boxSizing: 'border-box',
    overflow: 'auto',
    borderRadius: 8,
    backgroundColor: '#ffffff',
    color: '#111318',
    overscrollBehavior: 'contain',
  },
})
