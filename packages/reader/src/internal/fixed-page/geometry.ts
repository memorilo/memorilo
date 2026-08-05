import type { ReaderNormalizedRect } from '../../types'
import { readerMaximumScale, readerMinimumScale } from '../reader-adapter'

export function clampFixedPageScale(value: number): number {
  return Math.min(readerMaximumScale, Math.max(readerMinimumScale, Math.round(value * 10) / 10))
}

export function clampUnit(value: number): number {
  return Math.min(1, Math.max(0, value))
}

export function normalizedRectWithinSurface(
  rect: DOMRectReadOnly,
  surfaceRect: DOMRectReadOnly,
): ReaderNormalizedRect | null {
  const left = Math.max(rect.left, surfaceRect.left)
  const top = Math.max(rect.top, surfaceRect.top)
  const right = Math.min(rect.right, surfaceRect.right)
  const bottom = Math.min(rect.bottom, surfaceRect.bottom)
  if (right <= left || bottom <= top)
    return null
  return {
    height: clampUnit((bottom - top) / surfaceRect.height),
    width: clampUnit((right - left) / surfaceRect.width),
    x: clampUnit((left - surfaceRect.left) / surfaceRect.width),
    y: clampUnit((top - surfaceRect.top) / surfaceRect.height),
  }
}
