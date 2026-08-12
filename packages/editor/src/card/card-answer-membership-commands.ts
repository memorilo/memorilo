import type { Fragment, Node as ProseMirrorNode } from 'prosekit/pm/model'
import type { Command, EditorState, Transaction } from 'prosekit/pm/state'
import type { CardContext, CardDelimiterLocation } from './card-command-context'
import type { CardAnswerPresentation } from './card-model'
import { TextSelection } from 'prosekit/pm/state'
import { createIndentListCommand } from 'prosemirror-flat-list'
import {
  findCardContext,
  findOwnCardDelimiter,
  firstDirectChildPosition,
  listAncestors,
  matchingCardMembers,
} from './card-command-context'

function validateCardPresentation(value: unknown): asserts value is CardAnswerPresentation {
  if (value !== 'list' && value !== 'set')
    throw new TypeError(`Unsupported Card answer presentation: ${String(value)}`)
}

export function createCardAnswerBlock(
  state: EditorState,
  delimiter: CardDelimiterLocation,
  contentFrom?: number,
): {
  answerFrom: number
  answerTo: number
  node: ProseMirrorNode
} {
  const $delimiter = state.doc.resolve(delimiter.position)
  const textblock = $delimiter.parent
  if (!textblock.isTextblock)
    throw new Error('A Card delimiter must be inside a text block')
  const answerFrom = delimiter.position + delimiter.node.nodeSize
  const answerTo = $delimiter.end()
  const answerContentFrom = contentFrom ?? answerFrom
  if (answerContentFrom < answerFrom || answerContentFrom > answerTo)
    throw new RangeError('Card answer content must remain after its delimiter in the same text block')
  const answerContent: Fragment = state.doc.slice(answerContentFrom, answerTo).content
  const node = textblock.type.create(textblock.attrs, answerContent)
  return { answerFrom, answerTo, node }
}

function insertFirstCardMember(
  state: EditorState,
  transaction: Transaction,
  context: CardContext,
  presentation: CardAnswerPresentation,
  answerContentFrom?: number,
): number {
  const listType = state.schema.nodes.list
  if (!listType)
    throw new Error('The editor schema is missing the list node')
  const answer = createCardAnswerBlock(state, context.delimiter, answerContentFrom)
  const sourceKind = context.list.node.attrs.kind
  if (typeof sourceKind !== 'string' || sourceKind.length === 0)
    throw new Error('Creating a Card answer member requires a non-empty Source Block kind')
  const member = listType.create({
    cardItemDefinitionId: context.delimiter.attrs.definitionId,
    checked: false,
    collapsed: false,
    kind: presentation === 'list' ? 'ordered' : sourceKind === 'ordered' ? 'bullet' : sourceKind,
    order: null,
  }, answer.node)
  if (answer.answerFrom < answer.answerTo)
    transaction.delete(answer.answerFrom, answer.answerTo)
  const insertPosition = transaction.mapping.map(firstDirectChildPosition(context.list))
  transaction.insert(insertPosition, member)
  return insertPosition
}

export function setCardPresentationCommand(
  presentation: CardAnswerPresentation,
  answerContentFrom?: number,
): Command {
  validateCardPresentation(presentation)
  return (state, dispatch) => {
    const context = findCardContext(state)
    if (!context)
      return false
    const members = matchingCardMembers(context)
    if (!dispatch)
      return true

    const transaction = state.tr
    if (members.length === 0) {
      const insertPosition = insertFirstCardMember(state, transaction, context, presentation, answerContentFrom)
      transaction.setSelection(TextSelection.near(transaction.doc.resolve(insertPosition + 2), 1))
    }
    else {
      for (const member of members) {
        const currentKind = member.node.attrs.kind
        if (typeof currentKind !== 'string' || currentKind.length === 0)
          throw new Error('Changing Card answer presentation requires a non-empty member Block kind')
        const kind = presentation === 'list'
          ? 'ordered'
          : currentKind === 'ordered' ? 'bullet' : currentKind
        transaction.setNodeMarkup(member.position, undefined, {
          ...member.node.attrs,
          kind,
          order: null,
        })
      }
    }
    dispatch(transaction.scrollIntoView())
    return true
  }
}

function memberListKind(context: CardContext): 'bullet' | 'ordered' {
  const members = matchingCardMembers(context)
  if (members.length === 0)
    return 'bullet'
  const ordered = members.map(member => member.node.attrs.kind === 'ordered')
  if (ordered.some(Boolean) && ordered.some(value => !value))
    throw new Error(`Card ${context.delimiter.attrs.definitionId} has mixed answer presentation`)
  return ordered.every(Boolean) ? 'ordered' : 'bullet'
}

function addedCardMemberKind(context: CardContext, block: ProseMirrorNode): string {
  const currentKind = block.attrs.kind
  if (typeof currentKind !== 'string' || currentKind.length === 0)
    throw new Error('Adding a Block to a Card Back requires a non-empty Block kind')
  if (memberListKind(context) === 'ordered')
    return 'ordered'
  return currentKind === 'ordered' ? 'bullet' : currentKind
}

function findListPositionByBlockId(node: ProseMirrorNode, blockId: string): number | null {
  let result: number | null = null
  node.descendants((child, position) => {
    if (result !== null)
      return false
    if (child.type.name === 'list' && child.attrs.blockId === blockId) {
      result = position
      return false
    }
    return true
  })
  return result
}

const indentList = createIndentListCommand()

export function addBlockToCardBackCommand(): Command {
  return (state, dispatch, view) => {
    const current = listAncestors(state)[0]
    if (!current)
      return false
    const parentDepth = current.depth - 1
    const parent = state.selection.$from.node(parentDepth)
    const index = state.selection.$from.index(parentDepth)

    if (parent.type.name === 'list') {
      const parentLocation = {
        depth: parentDepth,
        node: parent,
        position: state.selection.$from.before(parentDepth),
      }
      const delimiter = findOwnCardDelimiter(parentLocation)
      if (!delimiter)
        return false
      if (current.node.attrs.cardItemDefinitionId === delimiter.attrs.definitionId)
        return false
      if (!dispatch)
        return true
      const context = { delimiter, list: parentLocation }
      dispatch(state.tr.setNodeMarkup(current.position, undefined, {
        ...current.node.attrs,
        cardItemDefinitionId: delimiter.attrs.definitionId,
        kind: addedCardMemberKind(context, current.node),
        order: null,
      }).scrollIntoView())
      return true
    }

    if (index === 0)
      return false
    const previousSibling = parent.child(index - 1)
    if (previousSibling.type.name !== 'list')
      return false
    const previousPosition = current.position - previousSibling.nodeSize
    const previousLocation = {
      depth: current.depth,
      node: previousSibling,
      position: previousPosition,
    }
    const delimiter = findOwnCardDelimiter(previousLocation)
    if (!delimiter)
      return false
    const blockId = current.node.attrs.blockId
    if (typeof blockId !== 'string' || blockId.length === 0)
      throw new Error('Adding a Block to a Card Back requires a stable BlockID')

    if (!dispatch)
      return true

    let indented: Transaction | null = null
    if (!indentList(state, (transaction) => {
      indented = transaction
    }, view) || !indented) {
      return false
    }
    const transaction: Transaction = indented
    const movedPosition = findListPositionByBlockId(transaction.doc, blockId)
    if (movedPosition === null)
      throw new Error(`Indented Card answer Block ${blockId} is missing`)
    const movedNode = transaction.doc.nodeAt(movedPosition)
    if (!movedNode || movedNode.type.name !== 'list')
      throw new Error(`Indented Card answer Block ${blockId} is not a list node`)
    const context = { delimiter, list: previousLocation }
    transaction.setNodeMarkup(movedPosition, undefined, {
      ...movedNode.attrs,
      cardItemDefinitionId: delimiter.attrs.definitionId,
      kind: addedCardMemberKind(context, movedNode),
      order: null,
    })
    dispatch(transaction.scrollIntoView())
    return true
  }
}

export function removeBlockFromCardBackCommand(): Command {
  return (state, dispatch) => {
    const current = listAncestors(state)[0]
    if (!current || current.node.attrs.cardItemDefinitionId === null || current.node.attrs.cardItemDefinitionId === undefined)
      return false
    if (dispatch) {
      dispatch(state.tr.setNodeMarkup(current.position, undefined, {
        ...current.node.attrs,
        cardItemDefinitionId: null,
      }).scrollIntoView())
    }
    return true
  }
}
