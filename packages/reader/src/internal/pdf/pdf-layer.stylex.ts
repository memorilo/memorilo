import * as stylex from '@stylexjs/stylex'
import { regionSelectionClassNames } from '../region-selection.stylex'

const styles = stylex.create({
  annotationUnderline: {
    borderBottomStyle: 'solid',
    borderBottomWidth: '2px',
    borderRadius: 0,
  },
  canvas: {
    display: 'block',
    inset: 0,
    position: 'absolute',
  },
  continuousList: {
    alignItems: 'center',
    display: 'flex',
    flexDirection: 'column',
    gap: '24px',
    minWidth: '100%',
    padding: '24px',
    width: 'max-content',
  },
  markedContent: {
    display: 'contents',
  },
  ocrTextItem: {
    display: 'block',
    lineHeight: 1,
    overflow: 'hidden',
    transform: 'none',
    whiteSpace: 'pre',
  },
  page: {
    backgroundColor: '#fff',
    boxShadow: '0 2px 12px rgba(22, 27, 35, 0.16)',
    flex: '0 0 auto',
    position: 'relative',
  },
  pageSlot: {
    alignItems: 'flex-start',
    display: 'flex',
    flex: '0 0 auto',
    justifyContent: 'center',
    width: '100%',
  },
  scaledTextItem: {
    fontSize: 'calc(var(--text-scale-factor) * var(--font-height))',
    transform: 'rotate(var(--rotate)) scaleX(var(--scale-x)) scale(var(--min-font-size-inv))',
    zIndex: 1,
  },
  scroller: {
    alignItems: 'flex-start',
    display: 'flex',
    height: '100%',
    justifyContent: 'center',
    overflow: 'auto',
    padding: '24px',
    width: '100%',
  },
  scrollerContinuous: {
    display: 'block',
    padding: 0,
  },
  textItem: {
    'color': 'transparent',
    'cursor': 'text',
    'position': 'absolute',
    'transformOrigin': '0 0',
    'userSelect': 'text',
    'whiteSpace': 'pre',
    '::selection': {
      backgroundColor: 'rgba(0, 113, 227, 0.28)',
      color: 'transparent',
    },
  },
  textLayer: {
    caretColor: 'CanvasText',
    color: 'transparent',
    forcedColorAdjust: 'none',
    inset: 0,
    lineHeight: 1,
    overflow: 'clip',
    position: 'absolute',
    textAlign: 'initial',
    textSizeAdjust: 'none',
    transformOrigin: '0 0',
    zIndex: 2,
  },
})

function className(...values: stylex.StyleXStyles[]): string {
  return stylex.props(...values).className ?? ''
}

export const pdfLayerClassNames = {
  annotation: regionSelectionClassNames.annotation,
  annotationUnderline: className(styles.annotationUnderline),
  annotations: regionSelectionClassNames.annotations,
  canvas: className(styles.canvas),
  continuousList: className(styles.continuousList),
  page: className(styles.page),
  pageSlot: className(styles.pageSlot),
  scroller: className(styles.scroller),
  scrollerContinuous: className(styles.scroller, styles.scrollerContinuous),
  textLayer: className(styles.textLayer),
} as const

function addStyle(element: Element, value: string): void {
  element.classList.add(...value.split(' ').filter(Boolean))
}

export function applyPdfTextLayerContentStyles(layer: HTMLDivElement, ocr: boolean): void {
  layer.style.setProperty('--min-font-size', '1')
  layer.style.setProperty('--text-scale-factor', 'calc(var(--total-scale-factor) * var(--min-font-size))')
  layer.style.setProperty('--min-font-size-inv', 'calc(1 / var(--min-font-size))')

  for (const element of layer.querySelectorAll('span, br'))
    addStyle(element, className(styles.textItem, ocr && styles.ocrTextItem))

  if (ocr)
    return

  for (const element of layer.querySelectorAll(':scope > :not(.markedContent), .markedContent span:not(.markedContent)'))
    addStyle(element, className(styles.scaledTextItem))
  for (const element of layer.querySelectorAll('.markedContent'))
    addStyle(element, className(styles.markedContent))
}

export function pdfAnnotationClassName(style: 'highlight' | 'underline'): string {
  return style === 'underline'
    ? `${pdfLayerClassNames.annotation} ${pdfLayerClassNames.annotationUnderline}`
    : pdfLayerClassNames.annotation
}
