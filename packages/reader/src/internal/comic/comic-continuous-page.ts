import type { RegionSelectionResult } from '../region-selection'
import { combineLifecycleFailures } from '@memorilo/effect-lifecycle'
import { RegionSelectionController } from '../region-selection'

export interface ComicContinuousPage {
  annotationLayer: HTMLDivElement
  close: () => void
  imageNaturalHeight: number
  imageNaturalWidth: number
  pageNumber: number
  regionSelection: RegionSelectionController
  slot: HTMLDivElement
  surface: HTMLDivElement
}

interface CreateComicContinuousPageOptions {
  image: HTMLImageElement
  objectUrl: string
  onRegionSelection: (selection: RegionSelectionResult | null) => void
  onRegionSelectionEnabledChange: (enabled: boolean) => void
  pageNumber: number
  regionSelectionEnabled: boolean
  slot: HTMLDivElement
}

export function configureComicContinuousImage(
  image: HTMLImageElement,
  pageNumber: number,
  pageCount: number,
): void {
  image.alt = ''
  image.decoding = 'async'
  image.setAttribute('aria-label', `Page ${pageNumber} of ${pageCount}`)
  Object.assign(image.style, {
    display: 'block',
    height: '100%',
    userSelect: 'none',
    width: '100%',
  })
}

export function createComicContinuousPage(
  options: CreateComicContinuousPageOptions,
): ComicContinuousPage {
  const surface = document.createElement('div')
  Object.assign(surface.style, {
    flex: '0 0 auto',
    position: 'relative',
  })
  const annotationLayer = document.createElement('div')
  Object.assign(annotationLayer.style, {
    inset: '0',
    pointerEvents: 'none',
    position: 'absolute',
  })
  const regionCapture = document.createElement('div')
  regionCapture.setAttribute('aria-hidden', 'true')
  surface.append(options.image, annotationLayer, regionCapture)
  options.slot.replaceChildren(surface)
  const regionSelection = new RegionSelectionController({
    onEnabledChange: options.onRegionSelectionEnabledChange,
    onSelection: options.onRegionSelection,
  })
  try {
    regionSelection.mount(surface, regionCapture)
    regionSelection.setEnabled(options.regionSelectionEnabled)
    return {
      annotationLayer,
      close: () => {
        regionSelection.destroy()
        surface.remove()
        URL.revokeObjectURL(options.objectUrl)
      },
      imageNaturalHeight: options.image.naturalHeight,
      imageNaturalWidth: options.image.naturalWidth,
      pageNumber: options.pageNumber,
      regionSelection,
      slot: options.slot,
      surface,
    }
  }
  catch (error) {
    try {
      regionSelection.destroy()
      surface.remove()
    }
    catch (cleanupError) {
      throw combineLifecycleFailures(
        [error, cleanupError],
        `Failed to create and close continuous comic page ${options.pageNumber}`,
      )
    }
    throw error
  }
}
