import type { Decoration } from '@readium/navigator'
import type { BasicTextSelection } from '@readium/navigator-html-injectables'
import type { Link } from '@readium/shared'
import type {
  ReaderAnnotation,
  ReaderEpubLocator,
  ReaderTextQuote,
} from '../../types'
import type { ReaderAdapterSelection } from '../reader-adapter'
import type { ReaderOutlineSource } from '../reader-outline'
import { DecorationStyleType } from '@readium/navigator'
import { Locator } from '@readium/shared'
import { annotationDecorationTint } from '../annotations'
import { readerTextQuote } from '../reader-adapter'
import { ReaderOutlineProjection } from '../reader-outline'

export function serializedEpubLocator(locator: Locator): ReaderEpubLocator {
  const serialized = locator.serialize() as ReaderEpubLocator
  if (!serialized.href || !serialized.type)
    throw new Error('Readium returned an invalid locator')
  return serialized
}

export function readiumDecorations(annotation: ReaderAnnotation): Decoration[] {
  return annotation.anchors.flatMap((anchor, index): Decoration[] => {
    if (anchor.format !== 'epub' || anchor.type !== 'text')
      return []
    const locator = Locator.deserialize(anchor.locator)
    if (!locator)
      throw new Error(`Annotation ${annotation.id} contains an invalid EPUB locator`)
    return [{
      id: index === 0 ? annotation.id : `${annotation.id}:${index}`,
      locator,
      style: {
        expand: 0.001,
        tint: annotationDecorationTint(annotation.color),
        type: annotation.style === 'underline'
          ? DecorationStyleType.Underline
          : DecorationStyleType.Highlight,
      },
    }]
  })
}

export function readiumDecoration(annotation: ReaderAnnotation): Decoration | null {
  return readiumDecorations(annotation)[0] ?? null
}

export function epubOutline(
  links: readonly Link[],
): ReaderOutlineProjection<Link> {
  return new ReaderOutlineProjection(
    'epub',
    links.map(link => epubOutlineSource(link)),
    outlineItemId => new Error(`EPUB outline item ${outlineItemId} does not exist`),
  )
}

function epubOutlineSource(link: Link): ReaderOutlineSource<Link> {
  return {
    children: (link.children?.items ?? []).map(child => epubOutlineSource(child)),
    href: link.href,
    label: link.title?.trim() || link.href,
    navigable: true,
    target: link,
  }
}

export function projectEpubTextSelection(
  container: HTMLElement,
  selection: BasicTextSelection,
): ReaderAdapterSelection {
  if (!selection.locator)
    throw new Error('Readium did not provide a locator for the selected text')
  const frame = selectionFrame(container, selection.targetFrameSrc)
  const frameRect = frame.getBoundingClientRect()
  const quote = selectionQuote(frame, selection.text)
  return {
    clientRect: {
      height: selection.height,
      left: frameRect.left + selection.x,
      top: frameRect.top + selection.y,
      width: selection.width,
    },
    selection: {
      anchors: [{
        format: 'epub',
        locator: readerLocator(selection.locator, quote),
        quote,
        type: 'text',
      }],
      text: selection.text,
      type: 'text',
    },
  }
}

function readerLocator(locator: Locator, quote: ReaderTextQuote): ReaderEpubLocator {
  const serialized = serializedEpubLocator(locator)
  return {
    ...serialized,
    text: {
      ...serialized.text,
      after: quote.after,
      before: quote.before,
      highlight: quote.exact,
    },
  }
}

function selectionFrame(container: HTMLElement, targetFrameSrc: string): HTMLIFrameElement {
  const frames = [...container.querySelectorAll('iframe')]
  const matches = frames.filter((frame) => {
    if (frame.src === targetFrameSrc)
      return true
    try {
      return frame.contentWindow?.location.href === targetFrameSrc
    }
    catch {
      return false
    }
  })
  if (matches.length !== 1)
    throw new Error(`Unable to identify the EPUB selection frame (${matches.length} matches)`)
  return matches[0]!
}

function selectionQuote(frame: HTMLIFrameElement, exact: string): ReaderTextQuote {
  const selection = frame.contentWindow?.getSelection()
  if (!selection || selection.rangeCount === 0)
    return { exact }

  const range = selection.getRangeAt(0)
  const document = frame.contentDocument
  if (!document?.body)
    return { exact }
  const anchoredExact = range.toString()
  if (!anchoredExact)
    throw new Error('EPUB selection range does not contain text')

  return readerTextQuote(range, document.body, anchoredExact)
}
