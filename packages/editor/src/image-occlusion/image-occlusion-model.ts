import type { ReadingRegionAnchor } from '@memorilo/reading-model'

export type ImageOcclusionMode = 'hide-all' | 'hide-one'

export const imageOcclusionColor = '#2563eb'
export const imageOcclusionPreviewColor = 'rgb(37 99 235 / 42%)'
export const minimumOcclusionBrushStrokeRatio = 0.005
export const minimumOcclusionShapeSize = 0.005
export const occlusionBoundsStrokeRatio = 0.003

export interface ImageOcclusionSnapshot {
  height: number
  src: string
  width: number
}

export interface TopicImageOcclusionSourceReference {
  imageId: string
  kind: 'topic-image'
  topicId: string
}

export interface ReaderRegionImageOcclusionSourceReference {
  annotationId: string
  kind: 'reader-region'
  topicId: string
}

export type ImageOcclusionSourceReference
  = | ReaderRegionImageOcclusionSourceReference
    | TopicImageOcclusionSourceReference

export type ImageOcclusionSource
  = | ReaderRegionImageOcclusionSourceReference & {
    anchor: ReadingRegionAnchor
  }
  | TopicImageOcclusionSourceReference & {
    src: string
  }

interface OcclusionShapeBase {
  groupId: string
  id: string
}

export interface OcclusionBoundsShape extends OcclusionShapeBase {
  height: number
  kind: 'ellipse' | 'rectangle'
  width: number
  x: number
  y: number
}

export interface OcclusionBrushShape extends OcclusionShapeBase {
  kind: 'brush'
  points: readonly number[]
  strokeWidth: number
}

export type OcclusionShape = OcclusionBoundsShape | OcclusionBrushShape

export interface ImageOcclusionState {
  image: ImageOcclusionSnapshot
  mode: ImageOcclusionMode
  shapes: readonly OcclusionShape[]
  source: ImageOcclusionSourceReference
}

export interface OpenImageOcclusionInput {
  image: ImageOcclusionSnapshot
  imageId: string
}

export interface EditorImageOcclusionIntegration {
  getState: (imageId: string) => ImageOcclusionState | null
  open: (input: OpenImageOcclusionInput) => Promise<void> | void
  subscribe: (listener: () => void) => () => void
}

export interface ImageOcclusionCardProjection {
  definitionId: string
  direction: 'forward'
  id: string
  image: ImageOcclusionSnapshot
  kind: 'image-occlusion'
  mode: ImageOcclusionMode
  shapes: readonly OcclusionShape[]
  sourceBlockId: string
  targetGroupId: string
}

export function imageOcclusionSourceKey(source: ImageOcclusionSourceReference): string {
  return source.kind === 'topic-image'
    ? `${source.topicId}\0topic-image\0${source.imageId}`
    : `${source.topicId}\0reader-region\0${source.annotationId}`
}

export function imageOcclusionSourceObjectId(source: ImageOcclusionSourceReference): string {
  return source.kind === 'topic-image' ? source.imageId : source.annotationId
}

function clamp(value: number, minimum = 0, maximum = 1): number {
  return Math.min(maximum, Math.max(minimum, value))
}

export function containOcclusionBoundsShape(
  shape: OcclusionBoundsShape,
): OcclusionBoundsShape {
  const width = clamp(shape.width, minimumOcclusionShapeSize, 1)
  const height = clamp(shape.height, minimumOcclusionShapeSize, 1)
  return {
    ...shape,
    height,
    width,
    x: clamp(shape.x, 0, 1 - width),
    y: clamp(shape.y, 0, 1 - height),
  }
}

function axisBounds(points: readonly number[], offset: 0 | 1): { maximum: number, minimum: number } {
  const values = points.filter((_, index) => index % 2 === offset)
  if (values.length === 0)
    throw new TypeError('Occlusion brush must contain complete point pairs')
  return {
    maximum: Math.max(...values),
    minimum: Math.min(...values),
  }
}

export function translateOcclusionBrushShape(
  shape: OcclusionBrushShape,
  dx: number,
  dy: number,
): OcclusionBrushShape {
  const horizontal = axisBounds(shape.points, 0)
  const vertical = axisBounds(shape.points, 1)
  const containedDx = clamp(dx, -horizontal.minimum, 1 - horizontal.maximum)
  const containedDy = clamp(dy, -vertical.minimum, 1 - vertical.maximum)
  return {
    ...shape,
    points: shape.points.map((value, index) => (
      value + (index % 2 === 0 ? containedDx : containedDy)
    )),
  }
}

function containAxis(values: readonly number[]): readonly number[] {
  const minimum = Math.min(...values)
  const maximum = Math.max(...values)
  const span = maximum - minimum
  if (span > 1)
    return values.map(value => (value - minimum) / span)
  const offset = minimum < 0 ? -minimum : maximum > 1 ? 1 - maximum : 0
  return values.map(value => value + offset)
}

export function transformOcclusionBrushShape(
  shape: OcclusionBrushShape,
  scaleX: number,
  scaleY: number,
  dx: number,
  dy: number,
): OcclusionBrushShape {
  const horizontal = containAxis(shape.points
    .filter((_, index) => index % 2 === 0)
    .map(value => value * Math.abs(scaleX) + dx))
  const vertical = containAxis(shape.points
    .filter((_, index) => index % 2 === 1)
    .map(value => value * Math.abs(scaleY) + dy))
  let horizontalIndex = 0
  let verticalIndex = 0
  return {
    ...shape,
    points: shape.points.map((_, index) => index % 2 === 0
      ? horizontal[horizontalIndex++]!
      : vertical[verticalIndex++]!),
  }
}

export function scaleOcclusionBrushPoints(
  shape: OcclusionBrushShape,
  width: number,
  height: number,
  x = 0,
  y = 0,
): number[] {
  return shape.points.map((value, index) => (
    value * (index % 2 === 0 ? width : height) + (index % 2 === 0 ? x : y)
  ))
}

export function imageOcclusionBrushStrokeWidth(
  shape: OcclusionBrushShape,
  width: number,
  height: number,
): number {
  return Math.max(minimumOcclusionBrushStrokeRatio, shape.strokeWidth) * Math.min(width, height)
}

export function imageOcclusionBoundsStrokeWidth(width: number, height: number): number {
  return occlusionBoundsStrokeRatio * Math.min(width, height)
}

export function shouldRegroupImageOcclusionShapes(
  shapes: readonly OcclusionShape[],
  selectedIds: readonly string[],
): boolean {
  if (selectedIds.length < 2)
    return false
  const selected = new Set(selectedIds)
  const selectedShapes = shapes.filter(shape => selected.has(shape.id))
  if (selectedShapes.length !== selected.size)
    return false
  const selectedGroupIds = new Set(selectedShapes.map(shape => shape.groupId))
  if (selectedGroupIds.size !== 1)
    return true
  const [groupId] = selectedGroupIds
  return shapes.some(shape => shape.groupId === groupId && !selected.has(shape.id))
}

function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value))
    return value.map(canonicalValue)
  if (value === null || typeof value !== 'object')
    return value
  return Object.fromEntries(Object.keys(value).sort().map(key => [
    key,
    canonicalValue((value as Record<string, unknown>)[key]),
  ]))
}

export function imageOcclusionStateSignature(state: ImageOcclusionState): string {
  return JSON.stringify(canonicalValue(state))
}

export function projectImageOcclusionCards(
  state: ImageOcclusionState,
): readonly ImageOcclusionCardProjection[] {
  const groupIds: string[] = []
  const seen = new Set<string>()
  for (const shape of state.shapes) {
    if (seen.has(shape.groupId))
      continue
    seen.add(shape.groupId)
    groupIds.push(shape.groupId)
  }
  return groupIds.map(groupId => ({
    definitionId: groupId,
    direction: 'forward',
    id: groupId,
    image: structuredClone(state.image),
    kind: 'image-occlusion',
    mode: state.mode,
    shapes: structuredClone(state.shapes),
    sourceBlockId: imageOcclusionSourceObjectId(state.source),
    targetGroupId: groupId,
  }))
}
