import type { ReaderAnnotation } from '../../types'
import type { ReaderAdapterSelection, ReaderClientRect } from '../reader-adapter'
import type { TxtDocument } from './txt-document'
import { annotationOverlayTint } from '../annotations'
import { boundingReaderClientRect } from '../reader-adapter'
import { regionSelectionClassNames } from '../region-selection.stylex'

interface TxtDocumentProjectionElements {
  annotationLayer: HTMLDivElement
  article: HTMLElement
  content: HTMLDivElement
  scroller: HTMLDivElement
}

export interface TxtDocumentProjection {
  captureSelection: (selection: Selection | null) => ReaderAdapterSelection | null | undefined
  currentOffset: () => number
  refreshRegionAnnotations: () => void
  regionSelection: (rect: ReaderClientRect) => ReaderAdapterSelection
  restoreOffset: (offset: number) => void
  setAnnotations: (annotations: readonly ReaderAnnotation[]) => void
}

function textOffset(article: HTMLElement, container: Node, offset: number): number {
  const prefix = article.ownerDocument.createRange()
  prefix.selectNodeContents(article)
  prefix.setEnd(container, offset)
  return prefix.toString().length
}

function textOffsetAtPoint(article: HTMLElement, x: number, y: number): number | null {
  const document = article.ownerDocument
  const caret = document.caretPositionFromPoint(x, y)
  if (caret && article.contains(caret.offsetNode))
    return textOffset(article, caret.offsetNode, caret.offset)

  const range = document.caretRangeFromPoint(x, y)
  if (range && article.contains(range.startContainer))
    return textOffset(article, range.startContainer, range.startOffset)
  return null
}

function textOffsetsWithinRect(article: HTMLElement, rect: ReaderClientRect): { end: number, start: number } {
  const right = rect.left + rect.width
  const bottom = rect.top + rect.height
  const points = [
    [rect.left + 1, rect.top + 1],
    [right - 1, rect.top + 1],
    [rect.left + 1, bottom - 1],
    [right - 1, bottom - 1],
    [rect.left + rect.width / 2, rect.top + rect.height / 2],
  ] as const
  const offsets = points
    .map(([x, y]) => textOffsetAtPoint(article, x, y))
    .filter((offset): offset is number => offset !== null)
  if (offsets.length === 0)
    throw new Error('TXT area selection does not intersect document text')
  const start = Math.min(...offsets)
  const end = Math.max(...offsets)
  if (start === end)
    throw new Error('TXT area selection is too small to anchor to document text')
  return { end, start }
}

function textPointAtOffset(article: HTMLElement, offset: number): { node: Text, offset: number } {
  const walker = article.ownerDocument.createTreeWalker(article, NodeFilter.SHOW_TEXT)
  let remaining = offset
  let lastText: Text | null = null
  while (walker.nextNode()) {
    const text = walker.currentNode as Text
    lastText = text
    if (remaining <= text.data.length)
      return { node: text, offset: remaining }
    remaining -= text.data.length
  }
  if (lastText && remaining === 0)
    return { node: lastText, offset: lastText.data.length }
  throw new Error(`TXT text offset ${offset} is outside the document`)
}

function textRange(article: HTMLElement, start: number, end: number): Range {
  const startPoint = textPointAtOffset(article, start)
  const endPoint = textPointAtOffset(article, end)
  const range = article.ownerDocument.createRange()
  range.setStart(startPoint.node, startPoint.offset)
  range.setEnd(endPoint.node, endPoint.offset)
  return range
}

export function createTxtDocumentProjection(
  document: TxtDocument,
  { annotationLayer, article, content, scroller }: TxtDocumentProjectionElements,
  regionAnnotationLabel: () => string,
): TxtDocumentProjection {
  let annotations: readonly ReaderAnnotation[] = []

  const refreshRegionAnnotations = (): void => {
    annotationLayer.replaceChildren()
    const contentRect = content.getBoundingClientRect()
    for (const annotation of annotations) {
      const anchor = annotation.anchors[0]
      if (anchor.format !== 'txt' || anchor.type !== 'region')
        continue
      const { end, start } = document.requireRegionRange(annotation, anchor)
      const rects = [...textRange(article, start, end).getClientRects()]
        .filter(rect => rect.width > 0 && rect.height > 0)
      for (const rect of rects) {
        const marker = article.ownerDocument.createElement('button')
        marker.className = regionSelectionClassNames.annotation
        marker.dataset.annotationId = annotation.id
        marker.setAttribute('aria-label', regionAnnotationLabel())
        marker.type = 'button'
        marker.style.backgroundColor = annotationOverlayTint(annotation.color)
        marker.style.height = `${rect.height}px`
        marker.style.left = `${rect.left - contentRect.left}px`
        marker.style.top = `${rect.top - contentRect.top}px`
        marker.style.width = `${rect.width}px`
        annotationLayer.append(marker)
      }
    }
  }

  const setAnnotations = (nextAnnotations: readonly ReaderAnnotation[]): void => {
    annotations = nextAnnotations
    const scrollTop = scroller.scrollTop
    const fragment = article.ownerDocument.createDocumentFragment()
    for (const run of document.annotationRuns(annotations)) {
      if (!run.annotation) {
        fragment.append(article.ownerDocument.createTextNode(run.text))
        continue
      }
      const marker = article.ownerDocument.createElement('span')
      marker.dataset.annotationId = run.annotation.id
      if (run.annotation.style === 'underline') {
        marker.style.textDecoration = `underline 1.5px ${annotationOverlayTint(run.annotation.color)}`
        marker.style.textUnderlineOffset = '2px'
      }
      else {
        marker.style.backgroundColor = annotationOverlayTint(run.annotation.color)
      }
      marker.textContent = run.text
      fragment.append(marker)
    }
    article.replaceChildren(fragment)
    scroller.scrollTop = scrollTop
    refreshRegionAnnotations()
  }

  const captureSelection = (selection: Selection | null): ReaderAdapterSelection | null | undefined => {
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed)
      return null
    const range = selection.getRangeAt(0)
    if (!article.contains(range.startContainer) || !article.contains(range.endContainer))
      return undefined
    const start = textOffset(article, range.startContainer, range.startOffset)
    const end = textOffset(article, range.endContainer, range.endOffset)
    if (start === end)
      return null
    const selectionStart = Math.min(start, end)
    const selectionEnd = Math.max(start, end)
    const rects = [...range.getClientRects()].filter(rect => rect.width > 0 && rect.height > 0)
    if (rects.length === 0)
      throw new Error('TXT selection did not produce a visible text rectangle')
    const anchor = document.textAnchor(selectionStart, selectionEnd)
    return {
      clientRect: boundingReaderClientRect(rects),
      selection: { anchors: [anchor], text: anchor.quote.exact, type: 'text' },
    }
  }

  const regionSelection = (rect: ReaderClientRect): ReaderAdapterSelection => {
    const { end, start } = textOffsetsWithinRect(article, rect)
    return {
      clientRect: rect,
      selection: {
        anchors: [{ end, format: 'txt', start, type: 'region' }],
        type: 'region',
      },
    }
  }

  const currentOffset = (): number => {
    if (document.length === 0)
      return 0
    const articleRect = article.getBoundingClientRect()
    const scrollerRect = scroller.getBoundingClientRect()
    const x = Math.min(articleRect.right - 1, Math.max(articleRect.left + 1, scrollerRect.left + 8))
    const y = Math.min(articleRect.bottom - 1, Math.max(articleRect.top + 1, scrollerRect.top + 8))
    const offset = textOffsetAtPoint(article, x, y)
    if (offset !== null)
      return offset
    const maximum = Math.max(0, scroller.scrollHeight - scroller.clientHeight)
    return maximum === 0 ? 0 : Math.round((scroller.scrollTop / maximum) * document.length)
  }

  const restoreOffset = (offset: number): void => {
    if (document.length === 0 || offset === 0) {
      scroller.scrollTop = 0
      return
    }
    const start = Math.min(offset, document.length - 1)
    const rect = textRange(article, start, start + 1).getBoundingClientRect()
    const scrollerRect = scroller.getBoundingClientRect()
    scroller.scrollLeft = Math.max(0, scroller.scrollLeft + rect.left - scrollerRect.left - 8)
    scroller.scrollTop = Math.max(0, scroller.scrollTop + rect.top - scrollerRect.top - 8)
  }

  return {
    captureSelection,
    currentOffset,
    refreshRegionAnnotations,
    regionSelection,
    restoreOffset,
    setAnnotations,
  }
}
