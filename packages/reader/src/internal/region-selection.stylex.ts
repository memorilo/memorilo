import * as stylex from '@stylexjs/stylex'

const styles = stylex.create({
  annotation: {
    'backgroundColor': {
      'default': null,
      '@media (forced-colors: active)': 'transparent',
    },
    'borderColor': {
      'default': 'transparent',
      '@media (forced-colors: active)': 'Highlight',
    },
    'borderRadius': '2px',
    'borderStyle': 'solid',
    'borderWidth': {
      'default': 0,
      '@media (forced-colors: active)': '2px',
    },
    'cursor': 'pointer',
    'mixBlendMode': {
      'default': 'multiply',
      '@media (forced-colors: active)': 'normal',
    },
    'padding': 0,
    'pointerEvents': 'auto',
    'position': 'absolute',
    ':focus-visible': {
      outline: '2px solid rgb(0, 113, 227)',
      outlineOffset: '2px',
    },
  },
  annotations: {
    inset: 0,
    overflow: 'hidden',
    pointerEvents: 'none',
    position: 'absolute',
    zIndex: 3,
  },
  capture: {
    cursor: 'crosshair',
    display: 'none',
    inset: 0,
    position: 'absolute',
    touchAction: 'none',
    userSelect: 'none',
    zIndex: 4,
  },
  captureActive: {
    display: 'block',
  },
  draft: {
    backgroundColor: {
      'default': 'rgba(0, 113, 227, 0.16)',
      '@media (forced-colors: active)': 'transparent',
    },
    borderColor: {
      'default': 'rgb(0, 113, 227)',
      '@media (forced-colors: active)': 'Highlight',
    },
    borderRadius: '3px',
    borderStyle: 'solid',
    borderWidth: {
      'default': '1px',
      '@media (forced-colors: active)': '2px',
    },
    boxShadow: '0 0 0 1px rgba(255, 255, 255, 0.55) inset',
    position: 'absolute',
  },
})

function className(...styles: stylex.StyleXStyles[]): string {
  return stylex.props(...styles).className ?? ''
}

export const regionSelectionClassNames = {
  annotation: className(styles.annotation),
  annotations: className(styles.annotations),
  capture: className(styles.capture),
  captureActive: className(styles.capture, styles.captureActive),
  draft: className(styles.draft),
} as const
