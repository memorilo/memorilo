import * as stylex from '@stylexjs/stylex'

export const readerAnnotationConnectorStyles = stylex.create({
  overlay: {
    position: 'absolute',
    zIndex: 7,
    inset: 0,
    width: '100%',
    height: '100%',
    overflow: 'visible',
    pointerEvents: 'none',
  },
  path: {
    fill: 'none',
    stroke: 'rgba(69, 76, 88, 0.34)',
    strokeWidth: 1.25,
  },
  pathActive: {
    stroke: 'rgba(0, 113, 227, 0.74)',
    strokeWidth: 1.75,
  },
  endpoint: {
    fill: 'rgb(255, 255, 255)',
    stroke: 'rgba(69, 76, 88, 0.48)',
    strokeWidth: 1.25,
  },
  endpointActive: {
    fill: 'rgb(0, 113, 227)',
    stroke: 'rgb(255, 255, 255)',
    strokeWidth: 1.5,
  },
})
