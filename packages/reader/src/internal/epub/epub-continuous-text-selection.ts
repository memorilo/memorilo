import type {
  ReaderEpubTextAnchor,
  ReaderTextQuote,
} from '../../types'
import type { ReaderAdapterSelection } from '../reader-adapter'
import { boundingReaderClientRect, readerTextQuote } from '../reader-adapter'

export interface EpubContinuousTextSection {
  content: HTMLElement
  href: string
  type: string
}

function textOffset(root: HTMLElement, container: Node, offset: number): number {
  const range = root.ownerDocument.createRange()
  range.selectNodeContents(root)
  range.setEnd(container, offset)
  return range.toString().length
}

function textPointAtOffset(root: HTMLElement, offset: number): { node: Text, offset: number } {
  const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT)
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
  throw new RangeError(`EPUB text offset ${offset} is outside ${root.dataset.href ?? 'a section'}`)
}

export function epubContinuousTextRange(
  root: HTMLElement,
  start: number,
  end: number,
): Range {
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end <= start)
    throw new RangeError(`Invalid EPUB text range ${start}..${end}`)
  const startPoint = textPointAtOffset(root, start)
  const endPoint = textPointAtOffset(root, end)
  const range = root.ownerDocument.createRange()
  range.setStart(startPoint.node, startPoint.offset)
  range.setEnd(endPoint.node, endPoint.offset)
  return range
}

export function epubContinuousTextOffsets(
  anchor: ReaderEpubTextAnchor,
  content: HTMLElement,
): { end: number, start: number } {
  const start = anchor.locator.locations?.memoriloTextStart
  const end = anchor.locator.locations?.memoriloTextEnd
  if (Number.isSafeInteger(start) && Number.isSafeInteger(end)
    && (start as number) >= 0 && (end as number) > (start as number)) {
    return { end: end as number, start: start as number }
  }
  const exact = anchor.quote.exact
  const match = content.textContent?.indexOf(exact) ?? -1
  if (match < 0)
    throw new Error(`Unable to locate EPUB annotation text in ${anchor.locator.href}`)
  return { end: match + exact.length, start: match }
}

function anchor(
  section: EpubContinuousTextSection,
  range: Range,
  exact: string,
): ReaderEpubTextAnchor {
  const start = textOffset(section.content, range.startContainer, range.startOffset)
  const end = textOffset(section.content, range.endContainer, range.endOffset)
  const length = section.content.textContent?.length ?? 0
  const quote: ReaderTextQuote = readerTextQuote(range, section.content, exact)
  return {
    format: 'epub',
    locator: {
      href: section.href,
      locations: {
        memoriloTextEnd: end,
        memoriloTextStart: start,
        progression: length === 0 ? 0 : start / length,
      },
      text: {
        after: quote.after,
        before: quote.before,
        highlight: quote.exact,
      },
      type: section.type,
    },
    quote,
    type: 'text',
  }
}

export function projectEpubContinuousTextSelection(
  selection: Selection | null,
  sections: readonly EpubContinuousTextSection[],
  frameRect: DOMRectReadOnly,
): ReaderAdapterSelection | null {
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed)
    return null
  const range = selection.getRangeAt(0)
  const anchors = sections.flatMap((section): ReaderEpubTextAnchor[] => {
    if (!range.intersectsNode(section.content))
      return []
    const fragment = section.content.ownerDocument.createRange()
    fragment.selectNodeContents(section.content)
    if (section.content.contains(range.startContainer))
      fragment.setStart(range.startContainer, range.startOffset)
    if (section.content.contains(range.endContainer))
      fragment.setEnd(range.endContainer, range.endOffset)
    const exact = fragment.toString().trim()
    return exact ? [anchor(section, fragment, exact)] : []
  })
  const firstAnchor = anchors[0]
  if (!firstAnchor)
    return null
  const localRects = [...range.getClientRects()].filter(rect => rect.width > 0 && rect.height > 0)
  if (localRects.length === 0)
    throw new Error('EPUB selection did not produce a visible text rectangle')
  const clientRects = localRects.map(rect => new DOMRect(
    frameRect.left + rect.left,
    frameRect.top + rect.top,
    rect.width,
    rect.height,
  ))
  return {
    clientRect: boundingReaderClientRect(clientRects),
    selection: {
      anchors: [firstAnchor, ...anchors.slice(1)],
      text: anchors.map(item => item.quote.exact).join('\n'),
      type: 'text',
    },
  }
}
