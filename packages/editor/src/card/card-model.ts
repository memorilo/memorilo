import type { NodeJSON } from 'prosekit/core'
import type { ImageOcclusionCardProjection } from '../image-occlusion/image-occlusion-model'

export type BasicCardDirection = 'backward' | 'forward'
export type CardPracticeDirection = BasicCardDirection | 'both' | 'disabled'
export type HighlightColor = 'blue' | 'green' | 'orange' | 'pink' | 'purple' | 'yellow'
export type CardAnswerPresentation = 'list' | 'set'

export interface BasicEditorCardProjection {
  back: readonly NodeJSON[]
  blockHighlight: HighlightColor | null
  definitionId: string
  direction: BasicCardDirection
  front: readonly NodeJSON[]
  id: string
  kind: 'basic'
  sourceBlockId: string
}

export interface ClozeEditorCardProjection {
  blockHighlight: HighlightColor | null
  clozeGroupId: string
  content: readonly NodeJSON[]
  definitionId: string
  id: string
  kind: 'cloze'
  sourceBlockId: string
}

export interface MultiLineCardItemProjection {
  blockId: string
  content: readonly NodeJSON[]
}

export interface MultiLineEditorCardProjection {
  blockHighlight: HighlightColor | null
  definitionId: string
  direction: BasicCardDirection
  id: string
  items: readonly MultiLineCardItemProjection[]
  kind: 'list' | 'set'
  prompt: readonly NodeJSON[]
  sourceBlockId: string
}

export type EditorCardProjection = BasicEditorCardProjection | ClozeEditorCardProjection | MultiLineEditorCardProjection
export type ReviewCardProjection = EditorCardProjection | ImageOcclusionCardProjection

export interface CardDelimiterAttrs {
  backwardCardId: string | null
  definitionId: string
  direction: CardPracticeDirection
  forwardCardId: string | null
}

interface SplitContent {
  after: NodeJSON[]
  attrs: CardDelimiterAttrs
  before: NodeJSON[]
}

export interface ClozeMarkAttrs {
  anchorKind: 'math-source' | 'rich-content'
  cardId: string
  definitionId: string
  groupId: string
}

export interface InlineHighlightMarkAttrs {
  color: HighlightColor
}

export interface CardBlockAttrs {
  blockHighlight: HighlightColor | null
  cardItemDefinitionId: string | null
}

function readNonEmptyString(value: unknown, description: string): string {
  if (typeof value !== 'string' || value.length === 0)
    throw new TypeError(`${description} must be a non-empty string`)
  return value
}

function readOptionalCardId(value: unknown, description: string): string | null {
  if (value === null)
    return null
  return readNonEmptyString(value, description)
}

function readDelimiterAttrs(node: NodeJSON): CardDelimiterAttrs {
  const attrs = node.attrs
  if (!attrs)
    throw new TypeError('Card delimiter attributes are required')
  const direction = attrs.direction
  if (direction !== 'forward' && direction !== 'backward' && direction !== 'both' && direction !== 'disabled')
    throw new TypeError(`Unsupported Card practice direction: ${String(direction)}`)

  return {
    backwardCardId: readOptionalCardId(attrs.backwardCardId, 'Backward CardID'),
    definitionId: readNonEmptyString(attrs.definitionId, 'Card definition ID'),
    direction,
    forwardCardId: readOptionalCardId(attrs.forwardCardId, 'Forward CardID'),
  }
}

function readClozeMarkAttrs(mark: NonNullable<NodeJSON['marks']>[number]): ClozeMarkAttrs {
  const attrs = mark.attrs
  if (!attrs)
    throw new TypeError('Cloze mark attributes are required')
  const anchorKind = attrs.anchorKind
  if (anchorKind !== 'rich-content' && anchorKind !== 'math-source')
    throw new TypeError(`Unsupported Cloze anchor kind: ${String(anchorKind)}`)
  return {
    anchorKind,
    cardId: readNonEmptyString(attrs.cardId, 'Cloze CardID'),
    definitionId: readNonEmptyString(attrs.definitionId, 'Cloze definition ID'),
    groupId: readNonEmptyString(attrs.groupId, 'ClozeGroup ID'),
  }
}

function rebuildNode(node: NodeJSON, content: readonly NodeJSON[]): NodeJSON {
  const rebuilt = structuredClone(node)
  if (content.length === 0)
    delete rebuilt.content
  else
    rebuilt.content = [...content]
  return rebuilt
}

function splitNodes(nodes: readonly NodeJSON[]): SplitContent | null {
  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index]
    if (!node)
      throw new Error(`Content node ${index} is missing`)
    if (node.type === 'cardDelimiter') {
      return {
        after: structuredClone(nodes.slice(index + 1)),
        attrs: readDelimiterAttrs(node),
        before: structuredClone(nodes.slice(0, index)),
      }
    }

    const nested = node.content ? splitNodes(node.content) : null
    if (!nested)
      continue

    const before = structuredClone(nodes.slice(0, index))
    const after = structuredClone(nodes.slice(index + 1))
    before.push(rebuildNode(node, nested.before))
    after.unshift(rebuildNode(node, nested.after))
    return { after, attrs: nested.attrs, before }
  }
  return null
}

function readBlockId(node: NodeJSON): string {
  return readNonEmptyString(node.attrs?.blockId, 'Source BlockID')
}

function readBlockHighlight(node: NodeJSON): HighlightColor | null {
  const color = node.attrs?.blockHighlight
  if (color === null)
    return null
  if (color !== 'yellow' && color !== 'green' && color !== 'blue' && color !== 'pink' && color !== 'orange' && color !== 'purple')
    throw new TypeError(`Unsupported block Highlight color: ${String(color)}`)
  return color
}

function requireCardId(value: string | null, direction: BasicCardDirection, definitionId: string): string {
  if (!value)
    throw new Error(`${direction === 'forward' ? 'Forward' : 'Backward'} CardID is required for definition ${definitionId}`)
  return value
}

function projectBasicCards(block: NodeJSON, split: SplitContent): BasicEditorCardProjection[] {
  const sourceBlockId = readBlockId(block)
  const blockHighlight = readBlockHighlight(block)
  const { attrs } = split
  const forward = (): BasicEditorCardProjection => ({
    back: split.after,
    blockHighlight,
    definitionId: attrs.definitionId,
    direction: 'forward',
    front: split.before,
    id: requireCardId(attrs.forwardCardId, 'forward', attrs.definitionId),
    kind: 'basic',
    sourceBlockId,
  })
  const backward = (): BasicEditorCardProjection => ({
    back: split.before,
    blockHighlight,
    definitionId: attrs.definitionId,
    direction: 'backward',
    front: split.after,
    id: requireCardId(attrs.backwardCardId, 'backward', attrs.definitionId),
    kind: 'basic',
    sourceBlockId,
  })

  if (attrs.direction === 'forward')
    return [forward()]
  if (attrs.direction === 'backward')
    return [backward()]
  return [forward(), backward()]
}

function projectClozeCards(
  block: NodeJSON,
  definitions: Map<string, ClozeMarkAttrs>,
): ClozeEditorCardProjection[] {
  const ownContent = block.content?.filter(child => child.type !== 'list') ?? []
  const groups = new Map<string, ClozeMarkAttrs>()
  const visit = (node: NodeJSON): void => {
    node.marks?.forEach((mark) => {
      if (mark.type !== 'cloze')
        return
      const attrs = readClozeMarkAttrs(mark)
      const existing = groups.get(attrs.cardId)
      if (existing && (existing.definitionId !== attrs.definitionId || existing.groupId !== attrs.groupId))
        throw new Error(`Cloze CardID ${attrs.cardId} has inconsistent definition or group IDs`)
      const existingDefinition = definitions.get(attrs.definitionId)
      if (existingDefinition && (existingDefinition.cardId !== attrs.cardId || existingDefinition.groupId !== attrs.groupId))
        throw new Error(`Cloze DefinitionID ${attrs.definitionId} has inconsistent CardID or ClozeGroup ID`)
      if (!existing)
        groups.set(attrs.cardId, attrs)
      if (!existingDefinition)
        definitions.set(attrs.definitionId, attrs)
    })
    node.content?.forEach(visit)
  }
  ownContent.forEach(visit)

  if (groups.size === 0)
    return []
  const sourceBlockId = readBlockId(block)
  const blockHighlight = readBlockHighlight(block)
  return [...groups.values()].map(attrs => ({
    blockHighlight,
    clozeGroupId: attrs.groupId,
    content: structuredClone(ownContent),
    definitionId: attrs.definitionId,
    id: attrs.cardId,
    kind: 'cloze',
    sourceBlockId,
  }))
}

function hasVisibleContent(nodes: readonly NodeJSON[]): boolean {
  return nodes.some((node) => {
    if (node.type === 'text')
      return typeof node.text === 'string' && node.text.length > 0
    if (node.content)
      return hasVisibleContent(node.content)
    return node.type !== 'paragraph' && node.type !== 'heading' && node.type !== 'blockquote'
  })
}

function readCardItemDefinitionId(block: NodeJSON): string | null {
  const value = block.attrs?.cardItemDefinitionId
  if (value === undefined || value === null)
    return null
  return readNonEmptyString(value, 'Card item definition ID')
}

function readCardAnswerPresentation(definitionId: string, childBlocks: readonly NodeJSON[]): CardAnswerPresentation {
  const ordered = childBlocks.map((child) => {
    const kind = child.attrs?.kind
    if (typeof kind !== 'string' || kind.length === 0)
      throw new TypeError(`Card member ${readBlockId(child)} requires a non-empty list kind`)
    return kind === 'ordered'
  })
  if (ordered.some(Boolean) && ordered.some(value => !value))
    throw new Error(`Multi-line Card ${definitionId} mixes ordered and non-ordered Card members`)
  return ordered.every(Boolean) ? 'list' : 'set'
}

function projectMultiLineCards(block: NodeJSON, split: SplitContent, childBlocks: readonly NodeJSON[]): MultiLineEditorCardProjection[] {
  const { attrs } = split
  const { definitionId, direction } = attrs
  if (hasVisibleContent(split.after))
    throw new Error(`Multi-line Card ${definitionId} cannot retain an inline answer after its delimiter`)

  const mode = readCardAnswerPresentation(definitionId, childBlocks)
  const sourceBlockId = readBlockId(block)
  const blockHighlight = readBlockHighlight(block)
  const prompt = split.before
  const items = childBlocks.map(child => ({
    blockId: readBlockId(child),
    content: structuredClone(child.content ?? []),
  }))

  const project = (cardDirection: BasicCardDirection, id: string): MultiLineEditorCardProjection => ({
    blockHighlight,
    definitionId,
    direction: cardDirection,
    id,
    items,
    kind: mode,
    prompt,
    sourceBlockId,
  })
  const forward = () => project('forward', requireCardId(attrs.forwardCardId, 'forward', definitionId))
  const backward = () => project('backward', requireCardId(attrs.backwardCardId, 'backward', definitionId))

  if (direction === 'forward')
    return [forward()]
  if (direction === 'backward')
    return [backward()]
  return [forward(), backward()]
}

function projectDefinitionCards(block: NodeJSON): readonly EditorCardProjection[] {
  const ownContent = block.content?.filter(child => child.type !== 'list') ?? []
  const split = splitNodes(ownContent)
  if (!split || split.attrs.direction === 'disabled')
    return []

  const memberBlocks = block.content?.filter(child => (
    child.type === 'list'
    && readCardItemDefinitionId(child) === split.attrs.definitionId
  )) ?? []
  if (memberBlocks.length === 0)
    return projectBasicCards(block, split)
  return projectMultiLineCards(block, split, memberBlocks)
}

export function projectEditorCards(document: NodeJSON): readonly EditorCardProjection[] {
  if (document.type !== 'doc')
    throw new TypeError(`Expected a doc node, received ${document.type}`)

  const cards: EditorCardProjection[] = []
  const clozeDefinitions = new Map<string, ClozeMarkAttrs>()
  const visit = (block: NodeJSON): void => {
    if (block.type !== 'list')
      throw new TypeError(`Expected a normalized list block, received ${block.type}`)
    cards.push(...projectDefinitionCards(block), ...projectClozeCards(block, clozeDefinitions))
    block.content?.filter(child => child.type === 'list').forEach(visit)
  }
  document.content?.forEach(visit)
  return cards
}
