import type { RefObject } from 'react'
import type {
  ReaderClientRect,
  ReaderImageOcclusionOverlay,
  ReaderImageOcclusionShape,
} from './types'
import * as stylex from '@stylexjs/stylex'
import { useLayoutEffect, useState } from 'react'
import { findAnnotationClientRect } from './internal/annotation-geometry'
import { readerImageOcclusionOverlayStyles as styles } from './reader-image-occlusion-overlays.stylex'

const imageOcclusionPreviewColor = 'rgb(37 99 235 / 42%)'
const imageOcclusionBoundsStrokeRatio = 0.003
const imageOcclusionBrushStrokeRatio = 0.005

interface ProjectedOverlay {
  overlay: ReaderImageOcclusionOverlay
  rect: ReaderClientRect
}

function brushPoints(shape: ReaderImageOcclusionShape, width: number, height: number): string {
  if (shape.kind !== 'brush')
    throw new TypeError(`Reader image occlusion shape ${shape.id} is not a brush`)
  if (shape.points.length < 4 || shape.points.length % 2 !== 0)
    throw new TypeError(`Reader image occlusion brush ${shape.id} has invalid points`)
  const values = shape.points.map((value, index) => value * (index % 2 === 0 ? width : height))
  const points: string[] = []
  for (let index = 0; index < values.length; index += 2)
    points.push(`${values[index]},${values[index + 1]}`)
  return points.join(' ')
}

function shapeNode(shape: ReaderImageOcclusionShape, width: number, height: number) {
  if (shape.kind === 'rectangle' || shape.kind === 'ellipse') {
    const strokeWidth = Math.max(1, imageOcclusionBoundsStrokeRatio * Math.min(width, height))
    if (shape.kind === 'rectangle') {
      return (
        <rect
          key={shape.id}
          fill={imageOcclusionPreviewColor}
          height={shape.height * height}
          stroke={imageOcclusionPreviewColor}
          strokeWidth={strokeWidth}
          width={shape.width * width}
          x={shape.x * width}
          y={shape.y * height}
        />
      )
    }
    return (
      <ellipse
        key={shape.id}
        cx={(shape.x + shape.width / 2) * width}
        cy={(shape.y + shape.height / 2) * height}
        fill={imageOcclusionPreviewColor}
        rx={shape.width * width / 2}
        ry={shape.height * height / 2}
        stroke={imageOcclusionPreviewColor}
        strokeWidth={strokeWidth}
      />
    )
  }
  if (shape.kind !== 'brush')
    throw new TypeError(`Unsupported Reader image occlusion shape kind: ${String(shape.kind)}`)
  const strokeWidth = Math.max(
    imageOcclusionBrushStrokeRatio,
    shape.strokeWidth,
  ) * Math.min(width, height)
  return (
    <polyline
      key={shape.id}
      fill="none"
      points={brushPoints(shape, width, height)}
      stroke={imageOcclusionPreviewColor}
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={strokeWidth}
    />
  )
}

export function ReaderImageOcclusionOverlays({
  engineRef,
  imageOcclusionOverlays,
  layoutKey,
  viewportRef,
}: {
  engineRef: RefObject<HTMLDivElement | null>
  imageOcclusionOverlays: readonly ReaderImageOcclusionOverlay[]
  layoutKey: unknown
  viewportRef: RefObject<HTMLDivElement | null>
}) {
  const [projected, setProjected] = useState<readonly ProjectedOverlay[]>([])

  useLayoutEffect(() => {
    const engine = engineRef.current
    const viewport = viewportRef.current
    if (!engine || !viewport || imageOcclusionOverlays.length === 0) {
      setProjected([])
      return
    }
    let frame: number | null = null
    const calculate = (): void => {
      frame = null
      const viewportRect = viewport.getBoundingClientRect()
      const next = imageOcclusionOverlays.flatMap((overlay) => {
        const rect = findAnnotationClientRect(engine, overlay.annotationId)
        if (!rect || overlay.shapes.length === 0)
          return []
        return [{
          overlay,
          rect: {
            height: rect.height,
            left: rect.left - viewportRect.left,
            top: rect.top - viewportRect.top,
            width: rect.width,
          },
        }]
      })
      setProjected(next)
    }
    const schedule = (): void => {
      if (frame === null)
        frame = requestAnimationFrame(calculate)
    }
    const resize = new ResizeObserver(schedule)
    resize.observe(viewport)
    resize.observe(engine)
    const mutations = new MutationObserver(schedule)
    mutations.observe(engine, { attributes: true, childList: true, subtree: true })
    document.addEventListener('scroll', schedule, true)
    window.addEventListener('resize', schedule, { passive: true })
    calculate()
    return () => {
      if (frame !== null)
        cancelAnimationFrame(frame)
      resize.disconnect()
      mutations.disconnect()
      document.removeEventListener('scroll', schedule, true)
      window.removeEventListener('resize', schedule)
    }
  }, [engineRef, imageOcclusionOverlays, layoutKey, viewportRef])

  return projected.length === 0
    ? null
    : (
        <svg
          {...stylex.props(styles.overlay)}
          aria-hidden="true"
          data-reader-capture-overlay="true"
          data-reader-image-occlusion-overlay=""
          preserveAspectRatio="none"
        >
          {projected.map(({ overlay, rect }) => (
            <svg
              key={overlay.annotationId}
              height={rect.height}
              preserveAspectRatio="none"
              viewBox={`0 0 ${overlay.image.width} ${overlay.image.height}`}
              width={rect.width}
              x={rect.left}
              y={rect.top}
            >
              {overlay.shapes.map(shape => shapeNode(shape, overlay.image.width, overlay.image.height))}
            </svg>
          ))}
        </svg>
      )
}
