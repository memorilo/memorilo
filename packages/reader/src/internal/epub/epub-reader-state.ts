import type { EpubNavigator } from '@readium/navigator'
import type { Locator } from '@readium/shared'
import type { ReaderPresentationMode } from '../../types'
import type { ReaderAdapterState } from '../reader-adapter'
import type { ReaderOutlineProjection } from '../reader-outline'
import type { EpubLayoutKind, ParsedEpub } from './epub-parser'
import { readerFontSizeScaleCapability } from '../reader-adapter'
import { serializedEpubLocator } from './epub-content-projection'

interface EpubReaderStateInput {
  locator: Locator
  navigator: EpubNavigator | null
  outline: ReaderOutlineProjection<unknown>
  parsed: ParsedEpub
  presentationMode: ReaderPresentationMode
  scale: number
  sourceName: string
}

function presentationReason(layout: EpubLayoutKind): string | undefined {
  if (layout === 'fixed')
    return 'This fixed-layout EPUB preserves its publisher-designed pages'
  if (layout === 'mixed')
    return 'This EPUB mixes fixed and reflowable sections, so publisher layout is preserved throughout'
  return undefined
}

export function projectEpubReaderState({
  locator,
  navigator,
  outline,
  parsed,
  presentationMode,
  scale,
  sourceName,
}: EpubReaderStateInput): ReaderAdapterState {
  const readingOrder = parsed.publication.readingOrder.items
  const resourceIndex = readingOrder.findIndex(link => link.href === locator.href)
  if (resourceIndex < 0)
    throw new Error(`EPUB locator ${locator.href} is outside the publication reading order`)
  const withinResource = locator.locations.progression ?? 0
  if (!Number.isFinite(withinResource) || withinResource < 0 || withinResource > 1)
    throw new RangeError('EPUB locator progression must be between 0 and 1')
  const progression = readingOrder.length <= 1
    ? withinResource
    : (resourceIndex + withinResource) / readingOrder.length
  const readerModeAvailable = parsed.layout === 'reflowable'
  return {
    canGoBackward: navigator?.canGoBackward ?? resourceIndex > 0,
    canGoForward: navigator?.canGoForward ?? resourceIndex < readingOrder.length - 1,
    capabilities: {
      annotations: true,
      ...(readerModeAvailable ? { scale: readerFontSizeScaleCapability } : {}),
      regionSelection: true,
      textSelection: true,
    },
    format: 'epub',
    location: {
      format: 'epub',
      href: locator.href,
      label: `Section ${resourceIndex + 1} of ${readingOrder.length}`,
      position: resourceIndex + 1,
      progression,
      total: readingOrder.length,
    },
    outline: outline.items,
    position: { format: 'epub', locator: serializedEpubLocator(locator) },
    presentationMode,
    presentationModeReason: presentationReason(parsed.layout),
    scale,
    title: parsed.title || sourceName,
  }
}
