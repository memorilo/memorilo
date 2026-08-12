import type { Node as ProseMirrorNode } from 'prosekit/pm/model'
import type { CardDelimiterAttrs, ClozeMarkAttrs } from './card-model'
import {
  validateAnchorKind,
  validateDirection,
  validateOptionalId,
  validateRequiredId,
} from '../schema/card-schema'

export interface CardSourceDefinition {
  definitionId: string
  hasCloze: boolean
  hasDelimiter: boolean
}

export interface CardSourceScope {
  definitions: CardSourceDefinition[]
  position: number
}

export function readDelimiterNodeAttrs(node: ProseMirrorNode): CardDelimiterAttrs {
  if (node.type.name !== 'cardDelimiter')
    throw new TypeError(`Expected a Card delimiter, received ${node.type.name}`)
  const attrs = node.attrs as CardDelimiterAttrs
  validateRequiredId(attrs.definitionId)
  validateDirection(attrs.direction)
  validateOptionalId(attrs.forwardCardId)
  validateOptionalId(attrs.backwardCardId)
  return attrs
}

export function findMultilineCardDelimiterPositions(document: ProseMirrorNode): Set<number> {
  const positions = new Set<number>()

  const visitCardSource = (list: ProseMirrorNode, listPosition: number): void => {
    const memberDefinitionIds = new Set<string>()
    list.forEach((child) => {
      if (child.type.name !== 'list')
        return
      const definitionId = child.attrs.cardItemDefinitionId
      if (definitionId === null || definitionId === undefined)
        return
      validateRequiredId(definitionId)
      memberDefinitionIds.add(definitionId)
    })

    const visitOwnContent = (node: ProseMirrorNode, nodePosition: number): void => {
      node.forEach((child, offset) => {
        const childPosition = nodePosition + 1 + offset
        if (child.type.name === 'list')
          return
        if (child.type.name === 'cardDelimiter') {
          const attrs = readDelimiterNodeAttrs(child)
          if (memberDefinitionIds.has(attrs.definitionId))
            positions.add(childPosition)
          return
        }
        visitOwnContent(child, childPosition)
      })
    }
    visitOwnContent(list, listPosition)

    list.forEach((child, offset) => {
      if (child.type.name === 'list')
        visitCardSource(child, listPosition + 1 + offset)
    })
  }

  document.forEach((child, offset) => {
    if (child.type.name === 'list')
      visitCardSource(child, offset)
  })
  return positions
}

export function findCardSourceScopes(document: ProseMirrorNode): CardSourceScope[] {
  const scopes: CardSourceScope[] = []
  const definitionOwners = new Map<string, number>()

  const visitList = (list: ProseMirrorNode, listPosition: number): void => {
    const definitions = new Map<string, CardSourceDefinition>()
    const addDefinition = (definition: CardSourceDefinition): void => {
      const existing = definitions.get(definition.definitionId)
      if (!existing) {
        definitions.set(definition.definitionId, definition)
        return
      }
      existing.hasCloze ||= definition.hasCloze
      existing.hasDelimiter ||= definition.hasDelimiter
    }
    const visitOwnContent = (node: ProseMirrorNode, nodePosition: number): void => {
      node.forEach((child, offset) => {
        if (child.type.name === 'list')
          return
        const childPosition = nodePosition + 1 + offset
        if (child.type.name === 'cardDelimiter') {
          addDefinition({
            definitionId: readDelimiterNodeAttrs(child).definitionId,
            hasCloze: false,
            hasDelimiter: true,
          })
        }
        for (const mark of child.marks) {
          if (mark.type.name !== 'cloze')
            continue
          const attrs = mark.attrs as ClozeMarkAttrs
          validateRequiredId(attrs.definitionId)
          validateRequiredId(attrs.groupId)
          validateRequiredId(attrs.cardId)
          validateAnchorKind(attrs.anchorKind)
          addDefinition({
            definitionId: attrs.definitionId,
            hasCloze: true,
            hasDelimiter: false,
          })
        }
        visitOwnContent(child, childPosition)
      })
    }
    visitOwnContent(list, listPosition)

    if (definitions.size > 0) {
      for (const definitionId of definitions.keys()) {
        const owner = definitionOwners.get(definitionId)
        if (owner !== undefined && owner !== listPosition)
          throw new Error(`Duplicate Card DefinitionID: ${definitionId}`)
        definitionOwners.set(definitionId, listPosition)
      }
      scopes.push({ definitions: Array.from(definitions.values()), position: listPosition })
    }

    list.forEach((child, offset) => {
      if (child.type.name === 'list')
        visitList(child, listPosition + 1 + offset)
    })
  }

  document.forEach((child, offset) => {
    if (child.type.name === 'list')
      visitList(child, offset)
  })
  return scopes
}

export function hasCardDefinition(document: ProseMirrorNode, definitionId: string): boolean {
  return findCardSourceScopes(document).some(scope => (
    scope.definitions.some(definition => definition.definitionId === definitionId)
  ))
}

export function ownCardDefinitionIds(node: ProseMirrorNode): Set<string> {
  const definitions = new Set<string>()
  const visit = (current: ProseMirrorNode): void => {
    current.forEach((child) => {
      if (child.type.name === 'list')
        return
      if (child.type.name === 'cardDelimiter') {
        definitions.add(readDelimiterNodeAttrs(child).definitionId)
        return
      }
      visit(child)
    })
  }
  visit(node)
  return definitions
}
