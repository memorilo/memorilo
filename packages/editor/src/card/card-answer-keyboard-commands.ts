import type { Command, Transaction } from 'prosekit/pm/state'
import { undoInputRule } from 'prosekit/pm/inputrules'
import { TextSelection } from 'prosekit/pm/state'
import { createSplitListCommand } from 'prosemirror-flat-list'
import { validateRequiredId } from '../schema/card-schema'
import { parseTaskHistory } from '../schema/task-schema'
import { initializeTaskSplit } from '../ui/task-list-view/task-split'
import { pauseTask } from '../ui/task-list-view/task-status'
import {
  createCardAnswerBlock,
  setCardPresentationCommand,
} from './card-answer-membership-commands'
import {
  findCardContext,
  findOwnCardDelimiter,
  listAncestors,
  matchingCardMembers,
} from './card-command-context'

const splitList = createSplitListCommand()

function enterCardAnswer(): Command {
  return (state, dispatch) => {
    if (!state.selection.empty)
      return false
    const context = findCardContext(state)
    if (!context)
      return false
    const delimiterEnd = context.delimiter.position + context.delimiter.node.nodeSize
    const $delimiter = state.doc.resolve(context.delimiter.position)
    if (state.selection.$from.parent !== $delimiter.parent || state.selection.from < delimiterEnd)
      return false
    const gap = state.doc.textBetween(delimiterEnd, state.selection.from, '', '\uFFFC')
    if (!/^\s*$/u.test(gap))
      return false

    const firstMember = matchingCardMembers(context)[0]
    if (firstMember) {
      if (dispatch) {
        const transaction = state.tr.delete(delimiterEnd, state.selection.from)
        const memberPosition = transaction.mapping.map(firstMember.position)
        transaction.setSelection(TextSelection.near(transaction.doc.resolve(memberPosition + 2), 1))
        dispatch(transaction.scrollIntoView())
      }
      return true
    }

    return setCardPresentationCommand('set', state.selection.from)(state, dispatch)
  }
}

function continueCardAnswerMember(): Command {
  return (state, dispatch, view) => {
    const current = listAncestors(state)[0]
    const definitionId = current?.node.attrs.cardItemDefinitionId
    if (!current || definitionId === null || definitionId === undefined)
      return false
    validateRequiredId(definitionId)

    const parentDepth = current.depth - 1
    if (parentDepth <= 0)
      return false
    const parent = state.selection.$from.node(parentDepth)
    if (parent.type.name !== 'list')
      return false
    const parentLocation = {
      depth: parentDepth,
      node: parent,
      position: state.selection.$from.before(parentDepth),
    }
    if (!findOwnCardDelimiter(parentLocation, definitionId))
      return false
    if (!dispatch)
      return splitList(state, undefined, view)

    let splitTransaction: Transaction | null = null
    if (!splitList(state, (transaction) => {
      splitTransaction = transaction
    }, view) || !splitTransaction) {
      return false
    }

    const transaction: Transaction = splitTransaction
    if (current.node.attrs.kind === 'task')
      initializeTaskSplit(transaction, current.position)
    const { $from } = transaction.selection
    let newMemberPosition: number | null = null
    for (let depth = $from.depth; depth > 0; depth -= 1) {
      if ($from.node(depth).type.name !== 'list')
        continue
      newMemberPosition = $from.before(depth)
      break
    }
    if (newMemberPosition === null)
      throw new Error(`Split Card member for ${definitionId} has no list ancestor`)
    const newMember = transaction.doc.nodeAt(newMemberPosition)
    if (!newMember || newMember.type.name !== 'list')
      throw new Error(`Split Card member for ${definitionId} is missing from the document`)
    transaction.setNodeMarkup(newMemberPosition, undefined, {
      ...newMember.attrs,
      cardItemDefinitionId: definitionId,
    })
    dispatch(transaction)
    return true
  }
}

export function enterCardCommand(): Command {
  const createAnswer = enterCardAnswer()
  const continueAnswer = continueCardAnswerMember()
  return (state, dispatch, view) => (
    createAnswer(state, dispatch, view) || continueAnswer(state, dispatch, view)
  )
}

function collapseSingleSetAnswer(): Command {
  return (state, dispatch) => {
    if (!(state.selection instanceof TextSelection))
      return false
    const { $cursor } = state.selection
    if (!$cursor || $cursor.parentOffset !== 0)
      return false

    const current = listAncestors(state)[0]
    if (!current || current.node.childCount !== 1)
      return false
    const memberKind = current.node.attrs.kind
    if (typeof memberKind !== 'string' || memberKind.length === 0)
      throw new Error('A Card answer member requires a non-empty list kind')
    if (memberKind === 'ordered')
      return false
    const definitionId = current.node.attrs.cardItemDefinitionId
    if (definitionId === null || definitionId === undefined)
      return false
    validateRequiredId(definitionId)
    const answerBlock = current.node.firstChild
    if (!answerBlock || !answerBlock.isTextblock || $cursor.parent !== answerBlock || $cursor.depth !== current.depth + 1)
      return false

    const context = findCardContext(state)
    if (!context || context.delimiter.attrs.definitionId !== definitionId)
      return false
    const members = matchingCardMembers(context)
    if (members.length !== 1 || members[0]?.position !== current.position)
      return false
    const sourceAnswer = createCardAnswerBlock(state, context.delimiter)
    if (sourceAnswer.answerFrom !== sourceAnswer.answerTo)
      return false
    if (answerBlock.type !== sourceAnswer.node.type)
      return true
    if (answerBlock.type.name === 'heading' && answerBlock.attrs.level !== sourceAnswer.node.attrs.level)
      return true
    const sourceHighlight = context.list.node.attrs.blockHighlight
    const answerHighlight = current.node.attrs.blockHighlight
    if (sourceHighlight !== null && answerHighlight !== null && sourceHighlight !== answerHighlight)
      return true
    const sourceTaskHistory = parseTaskHistory(sourceAnswer.node.attrs.taskHistory)
    const answerTaskHistory = memberKind === 'task'
      ? pauseTask(current.node.attrs)
      : parseTaskHistory(answerBlock.attrs.taskHistory)
    if (sourceTaskHistory && answerTaskHistory && (
      sourceTaskHistory.status !== answerTaskHistory.status
      || sourceTaskHistory.elapsedMs !== answerTaskHistory.elapsedMs
    )) {
      return true
    }
    if (answerTaskHistory && !Object.prototype.hasOwnProperty.call(sourceAnswer.node.attrs, 'taskHistory'))
      return true
    if (!dispatch)
      return true

    const answerContent = answerBlock.content
    const insertPosition = context.delimiter.position + context.delimiter.node.nodeSize
    const transaction = state.tr
    if (answerHighlight !== null) {
      transaction.setNodeMarkup(context.list.position, undefined, {
        ...context.list.node.attrs,
        blockHighlight: answerHighlight,
      })
    }
    if (answerTaskHistory) {
      const sourceTextblockPosition = state.doc.resolve(context.delimiter.position).before()
      transaction.setNodeMarkup(sourceTextblockPosition, undefined, {
        ...sourceAnswer.node.attrs,
        taskHistory: answerTaskHistory,
      })
    }
    transaction
      .delete(current.position, current.position + current.node.nodeSize)
      .insert(insertPosition, answerContent)
    transaction.setSelection(TextSelection.create(transaction.doc, insertPosition + answerContent.size))
    dispatch(transaction.scrollIntoView())
    return true
  }
}

export function backspaceCardCommand(): Command {
  const collapseAnswer = collapseSingleSetAnswer()
  return (state, dispatch, view) => (
    undoInputRule(state, dispatch, view) || collapseAnswer(state, dispatch, view)
  )
}
