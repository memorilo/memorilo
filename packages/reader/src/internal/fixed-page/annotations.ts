import type { ReaderAnnotationColor } from '../../types'

const annotationTints: Readonly<Record<ReaderAnnotationColor, string>> = {
  blue: 'rgba(64, 148, 255, 0.34)',
  green: 'rgba(63, 190, 108, 0.34)',
  pink: 'rgba(255, 83, 139, 0.32)',
  purple: 'rgba(140, 98, 255, 0.32)',
  yellow: 'rgba(255, 205, 31, 0.38)',
}

export function fixedPageAnnotationTint(color: ReaderAnnotationColor): string {
  return annotationTints[color]
}
