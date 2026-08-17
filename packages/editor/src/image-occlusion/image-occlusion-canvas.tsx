import type Konva from 'konva'
import type { KonvaEventObject } from 'konva/lib/Node'
import type { OcclusionShape } from './image-occlusion-model'
import { Ellipse, Line, Rect } from 'react-konva'
import {
  containOcclusionBoundsShape,
  imageOcclusionBoundsStrokeWidth,
  imageOcclusionBrushStrokeWidth,
  imageOcclusionColor,
  scaleOcclusionBrushPoints,
  translateOcclusionBrushShape,
} from './image-occlusion-model'

export interface ImageOcclusionViewport {
  height: number
  imageHeight: number
  imageWidth: number
  imageX: number
  imageY: number
  width: number
}

export function clamp(value: number, minimum = 0, maximum = 1): number {
  return Math.min(maximum, Math.max(minimum, value))
}

export function normalizedPoint(
  viewport: ImageOcclusionViewport,
  pointer: { x: number, y: number },
  requireInside = false,
) {
  const x = (pointer.x - viewport.imageX) / viewport.imageWidth
  const y = (pointer.y - viewport.imageY) / viewport.imageHeight
  if (requireInside && (x < 0 || x > 1 || y < 0 || y > 1))
    return null
  return {
    x: clamp(x),
    y: clamp(y),
  }
}

export function shapeWithOffset(shape: OcclusionShape, offset: number): OcclusionShape {
  if (shape.kind === 'brush')
    return translateOcclusionBrushShape(shape, offset, offset)
  return containOcclusionBoundsShape({ ...shape, x: shape.x + offset, y: shape.y + offset })
}

export function viewportFor(
  width: number,
  height: number,
  imageWidth: number,
  imageHeight: number,
): ImageOcclusionViewport {
  const inset = 28
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

export function shapeNodes(
  shape: OcclusionShape,
  viewport: ImageOcclusionViewport,
  selected: boolean,
  draggable: boolean,
  register: (node: Konva.Node | null) => void,
  onSelect: (event: KonvaEventObject<MouseEvent | TouchEvent>) => void,
  onDragEnd: (event: KonvaEventObject<DragEvent>) => void,
  onTransformEnd: (event: KonvaEventObject<Event>) => void,
) {
  const common = {
    draggable,
    fill: shape.kind === 'brush' ? undefined : imageOcclusionColor,
    name: shape.id,
    onClick: onSelect,
    onDragEnd,
    onTap: onSelect,
    onTransformEnd,
    opacity: 1,
    perfectDrawEnabled: false,
    ref: register,
    stroke: selected ? '#ffffff' : imageOcclusionColor,
    strokeWidth: selected ? 2 : imageOcclusionBoundsStrokeWidth(viewport.imageWidth, viewport.imageHeight),
  } as const
  if (shape.kind === 'rectangle') {
    return (
      <Rect
        key={shape.id}
        {...common}
        height={shape.height * viewport.imageHeight}
        width={shape.width * viewport.imageWidth}
        x={viewport.imageX + shape.x * viewport.imageWidth}
        y={viewport.imageY + shape.y * viewport.imageHeight}
      />
    )
  }
  if (shape.kind === 'ellipse') {
    return (
      <Ellipse
        key={shape.id}
        {...common}
        radiusX={shape.width * viewport.imageWidth / 2}
        radiusY={shape.height * viewport.imageHeight / 2}
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
      key={shape.id}
      {...common}
      fill={undefined}
      lineCap="round"
      lineJoin="round"
      points={points}
      stroke={imageOcclusionColor}
      strokeWidth={imageOcclusionBrushStrokeWidth(shape, viewport.imageWidth, viewport.imageHeight)}
    />
  )
}
