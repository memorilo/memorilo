import type { ReaderAnnotationColor } from '../types'

interface AnnotationActivationOwnerOptions {
  canActivate?: () => boolean
}

interface AnnotationColorDefinition {
  decoration: string
  overlay: string
}

const annotationColors: Readonly<Record<ReaderAnnotationColor, AnnotationColorDefinition>> = {
  blue: { decoration: '#77B7FF', overlay: 'rgba(64, 148, 255, 0.34)' },
  green: { decoration: '#75D49B', overlay: 'rgba(63, 190, 108, 0.34)' },
  pink: { decoration: '#FF8DB3', overlay: 'rgba(255, 83, 139, 0.32)' },
  purple: { decoration: '#B99BFF', overlay: 'rgba(140, 98, 255, 0.32)' },
  yellow: { decoration: '#FFD84D', overlay: 'rgba(255, 205, 31, 0.38)' },
}

/** Owns one delegated annotation activation listener for a rendered layer. */
export class AnnotationActivationOwner {
  readonly #handleClick: EventListener
  #closed = false

  constructor(
    private readonly root: HTMLElement,
    activate: (annotationId: string) => void,
    options: AnnotationActivationOwnerOptions = {},
  ) {
    this.#handleClick = (event) => {
      if (options.canActivate && !options.canActivate())
        return
      const target = event.target
      if (!target || typeof (target as Element).closest !== 'function')
        return
      const marker = (target as Element).closest<HTMLElement>('[data-annotation-id]')
      if (!marker || !this.root.contains(marker))
        return
      const annotationId = marker.dataset.annotationId
      if (annotationId)
        activate(annotationId)
    }
    root.addEventListener('click', this.#handleClick)
  }

  close(): void {
    if (this.#closed)
      return
    this.root.removeEventListener('click', this.#handleClick)
    this.#closed = true
  }
}

export function annotationDecorationTint(color: ReaderAnnotationColor): string {
  return annotationColors[color].decoration
}

export function annotationOverlayTint(color: ReaderAnnotationColor): string {
  return annotationColors[color].overlay
}
