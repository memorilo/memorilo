export type ImageOcclusionMode = 'hide-all' | 'hide-one'

export interface ImageOcclusionSnapshot {
  height: number
  src: string
  width: number
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
  sourceImageId: string
  sourceTopicId: string
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
    sourceBlockId: state.sourceImageId,
    targetGroupId: groupId,
  }))
}
