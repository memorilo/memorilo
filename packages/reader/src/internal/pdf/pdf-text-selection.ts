import type { ReaderNormalizedRect, ReaderPdfTextAnchor, ReaderTextLayerKind } from '../../types'
import type { ReaderAdapterSelection } from '../reader-adapter'
import { normalizedRectWithinSurface } from '../fixed-page/geometry'
import { boundingReaderClientRect, readerTextQuote } from '../reader-adapter'

export type PdfTextSelectionProjection
  = | { selection: ReaderAdapterSelection | null, status: 'owned' }
    | { status: 'outside' }

export function projectPdfTextSelection({
  kind,
  layer,
  pageNumber,
  pageSurface,
}: {
  kind: ReaderTextLayerKind
  layer: HTMLDivElement
  pageNumber: number
  pageSurface: HTMLDivElement
}): PdfTextSelectionProjection {
  const selection = document.getSelection()
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed)
    return { selection: null, status: 'owned' }

  const range = selection.getRangeAt(0)
  if (!layer.contains(range.startContainer) || !layer.contains(range.endContainer))
    return { status: 'outside' }

  const exact = selection.toString().trim()
  if (!exact)
    return { selection: null, status: 'owned' }
  if (kind !== 'embedded' && kind !== 'ocr')
    throw new Error('PDF text was selected without an active text layer')

  const surfaceRect = pageSurface.getBoundingClientRect()
  const domRects = [...range.getClientRects()].filter(rect => rect.width > 0 && rect.height > 0)
  const rects = domRects
    .map(rect => normalizedRectWithinSurface(rect, surfaceRect))
    .filter((rect): rect is ReaderNormalizedRect => rect !== null)
  if (rects.length === 0)
    throw new Error('PDF selection did not produce a visible text rectangle')

  const anchor: ReaderPdfTextAnchor = {
    format: 'pdf',
    pageNumber,
    quote: readerTextQuote(range, layer, exact),
    rects,
    source: kind,
    type: 'text',
  }
  return {
    selection: {
      clientRect: boundingReaderClientRect(domRects),
      selection: { anchor, text: exact, type: 'text' },
    },
    status: 'owned',
  }
}
