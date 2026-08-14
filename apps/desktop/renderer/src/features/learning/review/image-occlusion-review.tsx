import type { ImageOcclusionCardProjection, OcclusionShape } from '@memorilo/editor'
import type { RefObject } from 'react'
import {
  imageOcclusionBrushStrokeWidth,
  imageOcclusionColor,
  scaleOcclusionBrushPoints,
} from '@memorilo/editor'
import * as stylex from '@stylexjs/stylex'
import { LoaderCircle } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Ellipse, Image as KonvaImage, Layer, Line, Rect, Stage } from 'react-konva'

import { imageOcclusionReviewStyles as styles } from './image-occlusion-review.stylex'

interface Viewport {
  height: number
  imageHeight: number
  imageWidth: number
  imageX: number
  imageY: number
  width: number
}

function useElementSize(ref: RefObject<HTMLDivElement | null>) {
  const [size, setSize] = useState({ height: 1, width: 1 })
  useEffect(() => {
    const element = ref.current
    if (!element)
      return
    const update = () => {
      const bounds = element.getBoundingClientRect()
      setSize({ height: Math.max(1, bounds.height), width: Math.max(1, bounds.width) })
    }
    update()
    const observer = new ResizeObserver(update)
    observer.observe(element)
    return () => observer.disconnect()
  }, [ref])
  return size
}

function useImage(source: string) {
  const [image, setImage] = useState<HTMLImageElement | null>(null)
  const [error, setError] = useState(false)
  useEffect(() => {
    const next = new window.Image()
    let active = true
    next.onload = () => {
      if (active)
        setImage(next)
    }
    next.onerror = () => {
      if (active)
        setError(true)
    }
    setImage(null)
    setError(false)
    next.src = source
    return () => {
      active = false
      next.onload = null
      next.onerror = null
    }
  }, [source])
  return { error, image }
}

function viewportFor(width: number, height: number, imageWidth: number, imageHeight: number): Viewport {
  const inset = 18
  const availableWidth = Math.max(1, width - inset * 2)
  const availableHeight = Math.max(1, height - inset * 2)
  const scale = Math.min(availableWidth / imageWidth, availableHeight / imageHeight)
  const fittedWidth = imageWidth * scale
  const fittedHeight = imageHeight * scale
  return {
    height,
    imageHeight: fittedHeight,
    imageWidth: fittedWidth,
    imageX: (width - fittedWidth) / 2,
    imageY: (height - fittedHeight) / 2,
    width,
  }
}

function shapeNode(
  shape: OcclusionShape,
  viewport: Viewport,
  appearance: 'answer' | 'mask',
  target: boolean,
) {
  const fill = appearance === 'answer'
    ? 'rgb(22 163 74 / 10%)'
    : target ? imageOcclusionColor : '#161b24'
  const stroke = appearance === 'answer'
    ? '#16a34a'
    : target ? '#ffffff' : 'rgb(255 255 255 / 34%)'
  const strokeWidth = appearance === 'answer' || target ? 2 : 1
  if (shape.kind === 'rectangle') {
    return (
      <Rect
        key={`${appearance}:${shape.id}`}
        fill={fill}
        height={shape.height * viewport.imageHeight}
        listening={false}
        stroke={stroke}
        strokeWidth={strokeWidth}
        width={shape.width * viewport.imageWidth}
        x={viewport.imageX + shape.x * viewport.imageWidth}
        y={viewport.imageY + shape.y * viewport.imageHeight}
      />
    )
  }
  if (shape.kind === 'ellipse') {
    return (
      <Ellipse
        key={`${appearance}:${shape.id}`}
        fill={fill}
        listening={false}
        radiusX={shape.width * viewport.imageWidth / 2}
        radiusY={shape.height * viewport.imageHeight / 2}
        stroke={stroke}
        strokeWidth={strokeWidth}
        x={viewport.imageX + (shape.x + shape.width / 2) * viewport.imageWidth}
        y={viewport.imageY + (shape.y + shape.height / 2) * viewport.imageHeight}
      />
    )
  }
  if (shape.kind !== 'brush')
    throw new TypeError(`Unsupported OcclusionShape kind: ${String(shape.kind)}`)
  const points = scaleOcclusionBrushPoints(
    shape,
    viewport.imageWidth,
    viewport.imageHeight,
    viewport.imageX,
    viewport.imageY,
  )
  return (
    <Line
      key={`${appearance}:${shape.id}`}
      lineCap="round"
      lineJoin="round"
      listening={false}
      points={points}
      stroke={appearance === 'answer' ? '#16a34a' : target ? imageOcclusionColor : '#161b24'}
      strokeWidth={appearance === 'answer'
        ? 2
        : imageOcclusionBrushStrokeWidth(shape, viewport.imageWidth, viewport.imageHeight)}
    />
  )
}

export function ImageOcclusionReview({
  card,
  side,
}: {
  card: ImageOcclusionCardProjection
  side: 'answer' | 'question'
}) {
  const { t } = useTranslation('learning')
  const rootRef = useRef<HTMLDivElement>(null)
  const size = useElementSize(rootRef)
  const loaded = useImage(card.image.src)
  const viewport = useMemo(
    () => viewportFor(size.width, size.height, card.image.width, card.image.height),
    [card.image.height, card.image.width, size.height, size.width],
  )
  const targetShapes = useMemo(
    () => card.shapes.filter(shape => shape.groupId === card.targetGroupId),
    [card.shapes, card.targetGroupId],
  )
  const maskedShapes = useMemo(() => {
    if (card.mode === 'hide-one')
      return side === 'question' ? targetShapes : []
    return side === 'question'
      ? card.shapes
      : card.shapes.filter(shape => shape.groupId !== card.targetGroupId)
  }, [card.mode, card.shapes, card.targetGroupId, side, targetShapes])
  const answerShapes = side === 'question' ? [] : targetShapes
  const label = side === 'question' ? t('imageOcclusionQuestion') : t('imageOcclusionAnswer')

  return (
    <div
      ref={rootRef}
      {...stylex.props(styles.root)}
      aria-label={label}
      data-card-id={card.id}
      data-card-side={side}
      data-image-occlusion-review=""
      role="img"
    >
      {loaded.image
        ? (
            <Stage height={viewport.height} width={viewport.width}>
              <Layer>
                <Rect fill="#e7e9ed" height={viewport.height} listening={false} width={viewport.width} />
                <KonvaImage
                  height={viewport.imageHeight}
                  image={loaded.image}
                  listening={false}
                  width={viewport.imageWidth}
                  x={viewport.imageX}
                  y={viewport.imageY}
                />
                {maskedShapes.map(shape => shapeNode(
                  shape,
                  viewport,
                  'mask',
                  shape.groupId === card.targetGroupId,
                ))}
                {answerShapes.map(shape => shapeNode(shape, viewport, 'answer', true))}
              </Layer>
            </Stage>
          )
        : (
            <div {...stylex.props(styles.status, loaded.error && styles.error)} role={loaded.error ? 'alert' : 'status'}>
              {loaded.error
                ? t('imageOcclusionImageLoadFailed')
                : <LoaderCircle {...stylex.props(styles.spinner)} aria-hidden="true" size={18} />}
            </div>
          )}
    </div>
  )
}
