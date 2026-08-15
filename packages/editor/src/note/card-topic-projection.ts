import type { NodeJSON } from 'prosekit/core'
import type { EditorCardProjection } from '../card/card-model'
import type { CardTopicKind, CardTopicSource } from './editor-note'
import { projectEditorCards } from '../card/card-model'

export interface CardTopicDefinition {
  document: NodeJSON
  kind: CardTopicKind
  sourceId: string
}

export function cardTopicSourceIdentity(
  source: Pick<CardTopicSource, 'kind' | 'sourceId'>,
): string {
  const sourceKind = source.kind === 'basic' || source.kind === 'list' || source.kind === 'set'
    ? 'definition'
    : source.kind
  return `${sourceKind}\0${source.sourceId}`
}

function blockId(node: NodeJSON): string | null {
  return typeof node.attrs?.blockId === 'string' && node.attrs.blockId.length > 0
    ? node.attrs.blockId
    : null
}

function findBlock(document: NodeJSON, sourceBlockId: string): NodeJSON | null {
  let result: NodeJSON | null = null
  const visit = (node: NodeJSON): void => {
    if (node.type === 'list' && blockId(node) === sourceBlockId) {
      if (result)
        throw new Error(`Card source Block ${sourceBlockId} occurs more than once`)
      result = node
    }
    node.content?.forEach(visit)
  }
  visit(document)
  return result
}

function selectedContent(
  node: NodeJSON,
  markType: 'cloze' | 'inlineHighlight',
  sourceId: string,
): NodeJSON | null {
  const selected = node.marks?.some((mark) => {
    if (mark.type !== markType)
      return false
    if (markType === 'cloze')
      return mark.attrs?.groupId === sourceId
    return mark.attrs?.id === sourceId
  }) ?? false
  if (selected)
    return structuredClone(node)

  if (!node.content)
    return null
  const content = node.content
    .map(child => selectedContent(child, markType, sourceId))
    .filter((child): child is NodeJSON => child !== null)
  if (content.length === 0)
    return null
  const rebuilt = structuredClone(node)
  rebuilt.content = content
  return rebuilt
}

function sourceDocument(
  document: NodeJSON,
  card: EditorCardProjection,
  sourceId: string,
): NodeJSON {
  const source = findBlock(document, card.sourceBlockId)
  if (!source)
    throw new Error(`Card source Block ${card.sourceBlockId} is missing from its Topic`)
  if (card.kind === 'basic' || card.kind === 'list' || card.kind === 'set') {
    const definitionId = card.definitionId
    const content = source.content?.filter(child => (
      child.type !== 'list'
      || (card.kind !== 'basic' && child.attrs?.cardItemDefinitionId === definitionId)
    ))
    const fragment = structuredClone(source)
    fragment.content = content
    return { type: 'doc', content: [fragment] }
  }

  if (card.kind === 'highlight' && source.attrs?.blockHighlightId === sourceId) {
    const fragment = structuredClone(source)
    fragment.content = fragment.content?.filter(child => child.type !== 'list')
    return { type: 'doc', content: [fragment] }
  }

  const markType = card.kind === 'cloze' ? 'cloze' : 'inlineHighlight'
  const content = source.content
    ?.filter(child => child.type !== 'list')
    .map(child => selectedContent(child, markType, sourceId))
    .filter((child): child is NodeJSON => child !== null) ?? []
  const fragment = structuredClone(source)
  fragment.content = content.length > 0 ? content : [{ type: 'paragraph' }]
  return { type: 'doc', content: [fragment] }
}

function definitionForCard(document: NodeJSON, card: EditorCardProjection): CardTopicDefinition {
  const sourceId = card.kind === 'cloze'
    ? card.clozeGroupId
    : card.id
  return {
    document: sourceDocument(document, card, sourceId),
    kind: card.kind,
    sourceId: card.kind === 'basic' || card.kind === 'list' || card.kind === 'set' ? card.definitionId : sourceId,
  }
}

export function projectCardTopicDefinitions(document: NodeJSON, excluded?: CardTopicSource): readonly CardTopicDefinition[] {
  const cards = projectEditorCards(document)
  const definitions = new Map<string, CardTopicDefinition>()
  for (const card of cards) {
    const definition = definitionForCard(document, card)
    const key = cardTopicSourceIdentity(definition)
    if (excluded && key === cardTopicSourceIdentity(excluded))
      continue
    if (!definitions.has(key))
      definitions.set(key, definition)
  }
  return [...definitions.values()]
}

export function projectCardTopicCards(
  document: NodeJSON,
  source: CardTopicSource,
): readonly EditorCardProjection[] {
  return projectEditorCards(document).filter((card) => {
    if (source.kind === 'highlight')
      return card.kind === 'highlight' && card.id === source.sourceId
    if (source.kind === 'cloze')
      return card.kind === 'cloze' && card.clozeGroupId === source.sourceId
    return card.kind === source.kind && card.definitionId === source.sourceId
  })
}

export function cardTopicTitle(document: NodeJSON): string {
  const output: string[] = []
  const visit = (node: NodeJSON): void => {
    if (typeof node.text === 'string') {
      output.push(node.text)
      return
    }
    node.content?.forEach(visit)
  }
  visit(document)
  return Array.from(output.join('').replace(/[\t\r\n ]+/gu, ' ').trim()).slice(0, 20).join('')
}
