import type { Extension, Union } from 'prosekit/core'
import type { Node as ProseMirrorNode, ResolvedPos } from 'prosekit/pm/model'
import type { Command, EditorState } from 'prosekit/pm/state'
import type { CardSchemaExtension } from '../schema/card-schema'
import type {
  CardAnswerPresentation,
  CardDelimiterAttrs,
  CardPracticeDirection,
  ClozeMarkAttrs,
  HighlightColor,
  InlineHighlightMarkAttrs,
} from './card-model'
import {
  addMark,
  defineCommands,
  defineKeymap,
  Priority,
  removeMark,
  union,
  withPriority,
} from 'prosekit/core'
import { defineInputRule } from 'prosekit/extensions/input-rule'
import { InputRule } from 'prosekit/pm/inputrules'
import {
  defineCardSchema,
  validateAnchorKind,
  validateDirection,
  validateHighlightColor,
  validateRequiredId,
} from '../schema/card-schema'
import {
  backspaceCardCommand,
  enterCardCommand,
} from './card-answer-keyboard-commands'
import {
  addBlockToCardBackCommand,
  removeBlockFromCardBackCommand,
  setCardPresentationCommand,
} from './card-answer-membership-commands'
import {
  findDelimiterAtSelection,
  findOwnCardDelimiter,
  listAncestors,
  updateClosestListAttrs,
} from './card-command-context'
import { defineCardDelimiterNodeView, definePrioritizedCardDelimiterUi } from './card-delimiter-ui'
import { defineCardMembershipReconciler } from './card-membership-reconciler'

export {
  getSelectedCardDefinitionId,
  getSelectedCardDelimiterPosition,
  getSelectedCardDelimiterSurface,
  setSelectedCardDelimiterDefinitionId,
} from './card-delimiter-ui'
export type { CardDelimiterSurface } from './card-delimiter-ui'

export type CreateCardId = () => string

export interface CardExtensionOptions {
  createId?: CreateCardId
}

export interface InsertBasicCardInput {
  direction: 'backward' | 'both' | 'forward'
}

export interface ClozeIdentity {
  cardId: string
  definitionId: string
  groupId: string
}

export interface AddClozeInput {
  anchorKind: ClozeMarkAttrs['anchorKind']
  identity?: ClozeIdentity
}

export interface SetHighlightInput {
  color: HighlightColor
}

export interface SetCardDirectionInput {
  direction: CardPracticeDirection
}

export interface SetCardPresentationInput {
  presentation: CardAnswerPresentation
}

type CardCommandsExtension = Extension<{
  Commands: {
    addCloze: [input: AddClozeInput]
    addBlockToCardBack: []
    insertBasicCard: [input: InsertBasicCardInput]
    removeBlockHighlight: []
    removeCloze: []
    removeBlockFromCardBack: []
    removeInlineHighlight: []
    setCardDirection: [input: SetCardDirectionInput]
    setCardPresentation: [input: SetCardPresentationInput]
    setBlockHighlight: [input: SetHighlightInput]
    setInlineHighlight: [input: SetHighlightInput]
  }
}>

function defaultCreateId(): string {
  return crypto.randomUUID()
}

function isMathSourceNode(node: ProseMirrorNode): boolean {
  return node.type.name === 'mathInline' || node.type.name === 'mathBlock'
}

function sourceBlockPosition($position: ResolvedPos): number {
  for (let depth = $position.depth; depth > 0; depth -= 1) {
    if ($position.node(depth).type.name === 'list')
      return $position.before(depth)
  }
  if ($position.depth === 0)
    throw new RangeError('A Cloze selection endpoint must be inside a Source Block')
  return $position.before(1)
}

function addClozeMark(createId: CreateCardId, input: AddClozeInput): Command {
  return (state, dispatch) => {
    if (state.selection.empty)
      return false
    const { $from, $to } = state.selection
    if (sourceBlockPosition($from) !== sourceBlockPosition($to))
      return false
    const fromMathSource = isMathSourceNode($from.parent)
    const toMathSource = isMathSourceNode($to.parent)
    if (input.anchorKind === 'math-source' && (!fromMathSource || !toMathSource || $from.parent !== $to.parent))
      return false
    if (input.anchorKind === 'rich-content' && (fromMathSource || toMathSource))
      return false
    if (!dispatch)
      return true

    const resolvedIdentity = input.identity ?? (() => {
      const definitionId = createId()
      const groupId = createId()
      const cardId = createId()
      return { cardId, definitionId, groupId }
    })()
    validateRequiredId(resolvedIdentity.definitionId)
    validateRequiredId(resolvedIdentity.groupId)
    validateRequiredId(resolvedIdentity.cardId)
    return addMark({
      type: 'cloze',
      attrs: { anchorKind: input.anchorKind, ...resolvedIdentity } satisfies ClozeMarkAttrs,
    })(state, dispatch)
  }
}

function createDelimiterAttrs(createId: CreateCardId, direction: InsertBasicCardInput['direction']): CardDelimiterAttrs {
  const definitionId = createId()
  const forwardCardId = direction === 'forward' || direction === 'both' ? createId() : null
  const backwardCardId = direction === 'backward' || direction === 'both' ? createId() : null
  return { backwardCardId, definitionId, direction, forwardCardId }
}

function canInsertDelimiter(state: EditorState): boolean {
  if (!state.selection.empty)
    return false
  const parentName = state.selection.$from.parent.type.name
  if (parentName !== 'paragraph' && parentName !== 'heading')
    return false
  const currentList = listAncestors(state)[0]
  return !currentList || findOwnCardDelimiter(currentList) === null
}

function insertCardDelimiter(createId: CreateCardId, direction: InsertBasicCardInput['direction']): Command {
  return (state, dispatch) => {
    if (!canInsertDelimiter(state))
      return false
    if (!dispatch)
      return true
    const delimiter = state.schema.nodes.cardDelimiter?.create(createDelimiterAttrs(createId, direction))
    if (!delimiter)
      throw new Error('The editor schema is missing the Card delimiter node')
    dispatch(state.tr.replaceSelectionWith(delimiter).scrollIntoView())
    return true
  }
}

function setCardDirection(createId: CreateCardId, input: SetCardDirectionInput): Command {
  validateDirection(input.direction)
  return (state, dispatch) => {
    const delimiter = findDelimiterAtSelection(state)
    if (!delimiter)
      return false
    if (!dispatch)
      return true
    const enablesForward = input.direction === 'forward' || input.direction === 'both'
    const enablesBackward = input.direction === 'backward' || input.direction === 'both'
    const attrs: CardDelimiterAttrs = {
      ...delimiter.attrs,
      backwardCardId: enablesBackward ? delimiter.attrs.backwardCardId ?? createId() : delimiter.attrs.backwardCardId,
      direction: input.direction,
      forwardCardId: enablesForward ? delimiter.attrs.forwardCardId ?? createId() : delimiter.attrs.forwardCardId,
    }
    dispatch(state.tr.setNodeMarkup(delimiter.position, undefined, attrs).scrollIntoView())
    return true
  }
}

function defineCardInputRules(createId: CreateCardId): Extension {
  const rule = (match: RegExp, direction: InsertBasicCardInput['direction']) => defineInputRule(new InputRule(
    match,
    (state, _match, start, end) => {
      if (!canInsertDelimiter(state))
        return null
      const delimiter = state.schema.nodes.cardDelimiter?.create(createDelimiterAttrs(createId, direction))
      if (!delimiter)
        throw new Error('The editor schema is missing the Card delimiter node')
      return state.tr.replaceWith(start, end, delimiter)
    },
  ))
  return union(
    rule(/(?::->|：-》) $/u, 'forward'),
    rule(/(?::-<|：-《) $/u, 'backward'),
    rule(/(?::<>|：《》) $/u, 'both'),
  )
}

function defineCardCommands(createId: CreateCardId): CardCommandsExtension {
  return defineCommands({
    addCloze: ({ anchorKind, identity }: AddClozeInput) => {
      validateAnchorKind(anchorKind)
      return addClozeMark(createId, { anchorKind, identity })
    },
    addBlockToCardBack: () => addBlockToCardBackCommand(),
    insertBasicCard: ({ direction }: InsertBasicCardInput) => {
      validateDirection(direction)
      return insertCardDelimiter(createId, direction)
    },
    removeBlockHighlight: () => updateClosestListAttrs(() => ({ blockHighlight: null, blockHighlightId: null })),
    removeCloze: () => removeMark({ type: 'cloze' }),
    removeBlockFromCardBack: () => removeBlockFromCardBackCommand(),
    removeInlineHighlight: () => removeMark({ type: 'inlineHighlight' }),
    setCardDirection: (input: SetCardDirectionInput) => setCardDirection(createId, input),
    setCardPresentation: (input: SetCardPresentationInput) => setCardPresentationCommand(input.presentation),
    setBlockHighlight: ({ color }: SetHighlightInput) => {
      validateHighlightColor(color)
      return updateClosestListAttrs(() => ({ blockHighlight: color, blockHighlightId: crypto.randomUUID() }))
    },
    setInlineHighlight: ({ color }: SetHighlightInput) => {
      validateHighlightColor(color)
      return addMark({ type: 'inlineHighlight', attrs: { color, id: crypto.randomUUID() } satisfies InlineHighlightMarkAttrs })
    },
  })
}

export type CardExtension = Union<[
  CardSchemaExtension,
  CardCommandsExtension,
]>

export function defineCardExtension(options: CardExtensionOptions = {}): CardExtension {
  const createId = options.createId ?? defaultCreateId
  return union(
    defineCardSchema(),
    defineCardDelimiterNodeView(),
    definePrioritizedCardDelimiterUi(),
    defineCardCommands(createId),
    defineCardInputRules(createId),
    defineCardMembershipReconciler(),
    withPriority(defineKeymap({ Backspace: backspaceCardCommand(), Enter: enterCardCommand() }), Priority.highest),
  )
}
