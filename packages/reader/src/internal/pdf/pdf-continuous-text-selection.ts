import type {
  ReaderNormalizedRect,
  ReaderPdfTextAnchor,
  ReaderTextLayerKind,
} from '../../types'
import type { ReaderAdapterSelection } from '../reader-adapter'
import { normalizedRectWithinSurface } from '../fixed-page/geometry'
import { boundingReaderClientRect, readerTextQuote } from '../reader-adapter'

export interface PdfContinuousTextPage {
  kind: ReaderTextLayerKind
  pageNumber: number
  pageSurface: HTMLDivElement
  textLayer: HTMLDivElement
}

export function projectPdfContinuousTextSelection(
  selection: Selection | null,
  pages: readonly PdfContinuousTextPage[],
): ReaderAdapterSelection | null {
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed)
    return null
  const range = selection.getRangeAt(0)
  const anchors: ReaderPdfTextAnchor[] = [...pages]
    .sort((left, right) => left.pageNumber - right.pageNumber)
    .flatMap((page) => {
      if (!range.intersectsNode(page.textLayer))
        return []
      const ownerDocument = page.textLayer.ownerDocument
      const fragment = ownerDocument.createRange()
      fragment.selectNodeContents(page.textLayer)
      if (page.textLayer.contains(range.startContainer))
        fragment.setStart(range.startContainer, range.startOffset)
      if (page.textLayer.contains(range.endContainer))
        fragment.setEnd(range.endContainer, range.endOffset)
      const exact = fragment.toString().trim()
      if (!exact)
        return []
      if (page.kind !== 'embedded' && page.kind !== 'ocr')
        throw new Error(`PDF page ${page.pageNumber} has selected text without an active text layer`)
      const surfaceRect = page.pageSurface.getBoundingClientRect()
      const domRects = [...fragment.getClientRects()].filter(rect => rect.width > 0 && rect.height > 0)
      const rects = domRects
        .map(rect => normalizedRectWithinSurface(rect, surfaceRect))
        .filter((rect): rect is ReaderNormalizedRect => rect !== null)
      if (rects.length === 0)
        return []
      return [{
        format: 'pdf' as const,
        pageNumber: page.pageNumber,
        quote: readerTextQuote(fragment, page.textLayer, exact),
        rects,
        source: page.kind,
        type: 'text' as const,
      }]
    })
  const firstAnchor = anchors[0]
  if (!firstAnchor)
    return null
  const rects = [...range.getClientRects()].filter(rect => rect.width > 0 && rect.height > 0)
  if (rects.length === 0)
    throw new Error('PDF selection did not produce a visible text rectangle')
  return {
    clientRect: boundingReaderClientRect(rects),
    selection: {
      anchors: [firstAnchor, ...anchors.slice(1)],
      text: anchors.map(anchor => anchor.quote.exact).join('\n'),
      type: 'text',
    },
  }
}
