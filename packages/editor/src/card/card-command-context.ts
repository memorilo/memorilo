import type { Node as ProseMirrorNode } from 'prosekit/pm/model'
import type { Command, EditorState } from 'prosekit/pm/state'
import type { CardBlockAttrs, CardDelimiterAttrs } from './card-model'
import { NodeSelection } from 'prosekit/pm/state'
import { validateRequiredId } from '../schema/card-schema'
import { readDelimiterNodeAttrs } from './card-tree'

export interface ListLocation {
  depth: number
  node: ProseMirrorNode
  position: number
}

export interface CardDelimiterLocation {
  attrs: CardDelimiterAttrs
  node: ProseMirrorNode
  position: number
}

export interface CardContext {
  delimiter: CardDelimiterLocation
  list: ListLocation
}

export function findOwnCardDelimiter(
  list: ListLocation,
  requiredDefinitionId?: string,
): CardDelimiterLocation | null {
  const matches: CardDelimiterLocation[] = []
  const visit = (node: ProseMirrorNode, position: number): void => {
    node.forEach((child, offset) => {
      if (child.type.name === 'list')
        return
      const childPosition = position + 1 + offset
      if (child.type.name === 'cardDelimiter') {
        const attrs = readDelimiterNodeAttrs(child)
        if (!requiredDefinitionId || attrs.definitionId === requiredDefinitionId)
          matches.push({ attrs, node: child, position: childPosition })
        return
      }
      visit(child, childPosition)
    })
  }
  visit(list.node, list.position)
  if (matches.length > 1)
    throw new Error(`Card source Block contains multiple delimiters for Definition ${requiredDefinitionId ?? '(any)'}`)
  return matches[0] ?? null
}

export function listAncestors(state: EditorState): ListLocation[] {
  const ancestors: ListLocation[] = []
  const { $from } = state.selection
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const node = $from.node(depth)
    if (node.type.name === 'list')
      ancestors.push({ depth, node, position: $from.before(depth) })
  }
  return ancestors
}

export function findCardContext(state: EditorState): CardContext | null {
  const ancestors = listAncestors(state)
  for (let index = 0; index < ancestors.length; index += 1) {
    const list = ancestors[index]
    if (!list)
      throw new Error(`Card list ancestor ${index} is missing`)
    const ownDelimiter = findOwnCardDelimiter(list)
    if (ownDelimiter)
      return { delimiter: ownDelimiter, list }

    const memberDefinitionId = list.node.attrs.cardItemDefinitionId
    if (memberDefinitionId === null || memberDefinitionId === undefined)
      continue
    validateRequiredId(memberDefinitionId)
    const parentList = ancestors[index + 1]
    if (!parentList)
      return null
    const parentDelimiter = findOwnCardDelimiter(parentList, memberDefinitionId)
    if (parentDelimiter)
      return { delimiter: parentDelimiter, list: parentList }
  }
  return null
}

export function findDelimiterAtSelection(state: EditorState): CardDelimiterLocation | null {
  if (state.selection instanceof NodeSelection && state.selection.node.type.name === 'cardDelimiter') {
    const node = state.selection.node
    return { attrs: readDelimiterNodeAttrs(node), node, position: state.selection.from }
  }
  return findCardContext(state)?.delimiter ?? null
}

export function directChildLists(list: ListLocation): Array<{ node: ProseMirrorNode, position: number }> {
  const children: Array<{ node: ProseMirrorNode, position: number }> = []
  list.node.forEach((child, offset) => {
    if (child.type.name === 'list')
      children.push({ node: child, position: list.position + 1 + offset })
  })
  return children
}

export function matchingCardMembers(context: CardContext): Array<{ node: ProseMirrorNode, position: number }> {
  return directChildLists(context.list).filter(({ node }) => (
    node.attrs.cardItemDefinitionId === context.delimiter.attrs.definitionId
  ))
}

export function firstDirectChildPosition(list: ListLocation): number {
  const firstChild = directChildLists(list)[0]
  return firstChild?.position ?? list.position + list.node.nodeSize - 1
}

export function updateClosestListAttrs(
  resolveAttrs: (attrs: CardBlockAttrs) => Partial<CardBlockAttrs>,
): Command {
  return (state, dispatch) => {
    const { $from } = state.selection
    for (let depth = $from.depth; depth > 0; depth -= 1) {
      const node = $from.node(depth)
      if (node.type.name !== 'list')
        continue
      if (!dispatch)
        return true
      const nextAttrs = resolveAttrs(node.attrs as CardBlockAttrs)
      dispatch(state.tr.setNodeMarkup($from.before(depth), undefined, { ...node.attrs, ...nextAttrs }))
      return true
    }
    return false
  }
}
