import type { PointerEvent as ReactPointerEvent } from 'react'
import type { ResizeMode } from './use-image-resize'

interface ResizeHandlesProps {
  isResizing: boolean
  onPointerDown: (e: ReactPointerEvent<HTMLDivElement>, mode: ResizeMode) => void
}

export function ResizeHandles({ isResizing, onPointerDown }: ResizeHandlesProps) {
  const guardedPointerDown = (mode: ResizeMode) => (e: ReactPointerEvent<HTMLDivElement>) => {
    if (isResizing)
      return
    onPointerDown(e, mode)
  }

  return (
    <>
      <div
        aria-hidden="true"
        className="absolute top-0 right-0 z-40 h-full w-3 touch-none cursor-col-resize"
        onPointerDown={guardedPointerDown('width-only')}
      />
      <div
        aria-hidden="true"
        className="absolute bottom-0 left-0 z-40 h-3 w-full touch-none cursor-row-resize"
        onPointerDown={guardedPointerDown('height-only')}
      />
      <div
        aria-hidden="true"
        className="absolute right-0 bottom-0 z-50 size-6 touch-none cursor-nwse-resize"
        onPointerDown={guardedPointerDown('proportional')}
      />
    </>
  )
}
