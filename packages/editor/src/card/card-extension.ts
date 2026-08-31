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
import { matchesKeyboardShortcut } from '@memorilo/config'
import {
  addMark,
  defineCommands,
  defineKeymap,
  definePlugin,
  Priority,
  removeMark,
  union,
  withPriority,
} from 'prosekit/core'
import { defineInputRule } from 'prosekit/extensions/input-rule'
import { InputRule } from 'prosekit/pm/inputrules'
import { Plugin } from 'prosekit/pm/state'
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
  authoringEnabled?: boolean
  createId?: CreateCardId
  shortcuts?: { addBasicCard?: string, addCloze?: string, highlight?: string }
  onSemanticAction?: (action: 'cloze' | 'extract') => void
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

function toggleInlineHighlightCommand(): Command {
  return (state, dispatch) => {
    if (state.selection.empty)
      return false
    const markType = state.schema.marks.inlineHighlight
    if (!markType)
      return false
    const active = state.doc.rangeHasMark(state.selection.from, state.selection.to, markType)
    if (!dispatch)
      return true
    return (active
      ? removeMark({ type: 'inlineHighlight' })
      : addMark({ type: 'inlineHighlight', attrs: { color: 'yellow', id: crypto.randomUUID() } satisfies InlineHighlightMarkAttrs }))(state, dispatch)
  }
}

function toggleClozeCommand(createId: CreateCardId): Command {
  return (state, dispatch) => {
    if (state.selection.empty)
      return false
    const markType = state.schema.marks.cloze
    if (!markType)
      return false
    const active = state.doc.rangeHasMark(state.selection.from, state.selection.to, markType)
    if (active)
      return removeMark({ type: 'cloze' })(state, dispatch)
    const { $from, $to } = state.selection
    const anchorKind = ($from.parent.type.name === 'mathInline' || $from.parent.type.name === 'mathBlock')
      && $from.parent === $to.parent
      ? 'math-source'
      : 'rich-content'
    return addClozeMark(createId, { anchorKind })(state, dispatch)
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

function insertCardDelimiterFromTrigger(createId: CreateCardId): Command {
  return (state, dispatch) => {
    if (!canInsertDelimiter(state))
      return false
    const { $from } = state.selection
    const textBefore = $from.parent.textBetween(0, $from.parentOffset, '\n', '\uFFFC')
    const match = /(?::->|：-》|:-<|：-《|:<>|：《》)$/u.exec(textBefore)
    if (!match)
      return false
    const trigger = match[0]
    const direction: InsertBasicCardInput['direction'] = trigger === ':->' || trigger === '：-》'
      ? 'forward'
      : trigger === ':-<' || trigger === '：-《' ? 'backward' : 'both'
    if (!dispatch)
      return true
    const delimiter = state.schema.nodes.cardDelimiter?.create(createDelimiterAttrs(createId, direction))
    if (!delimiter)
      throw new Error('The editor schema is missing the Card delimiter node')
    dispatch(state.tr.replaceWith(state.selection.from - trigger.length, state.selection.from, delimiter).scrollIntoView())
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

function disabledCardCommand(): Command {
  return () => false
}

function semanticAction(command: Command, action: 'cloze' | 'extract', onSemanticAction?: (action: 'cloze' | 'extract') => void): Command {
  return (state, dispatch) => {
    const executed = command(state, dispatch)
    if (executed && dispatch)
      onSemanticAction?.(action)
    return executed
  }
}

function defineCardCommands(createId: CreateCardId, authoringEnabled: boolean, onSemanticAction?: (action: 'cloze' | 'extract') => void): CardCommandsExtension {
  return defineCommands({
    addCloze: ({ anchorKind, identity }: AddClozeInput) => {
      validateAnchorKind(anchorKind)
      return authoringEnabled ? semanticAction(addClozeMark(createId, { anchorKind, identity }), 'cloze', onSemanticAction) : disabledCardCommand()
    },
    addBlockToCardBack: () => authoringEnabled ? addBlockToCardBackCommand() : disabledCardCommand(),
    insertBasicCard: ({ direction }: InsertBasicCardInput) => {
      validateDirection(direction)
      return authoringEnabled ? insertCardDelimiter(createId, direction) : disabledCardCommand()
    },
    removeBlockHighlight: () => updateClosestListAttrs(() => ({ blockHighlight: null, blockHighlightId: null })),
    removeCloze: () => authoringEnabled ? removeMark({ type: 'cloze' }) : disabledCardCommand(),
    removeBlockFromCardBack: () => authoringEnabled ? removeBlockFromCardBackCommand() : disabledCardCommand(),
    removeInlineHighlight: () => removeMark({ type: 'inlineHighlight' }),
    setCardDirection: (input: SetCardDirectionInput) => authoringEnabled
      ? setCardDirection(createId, input)
      : disabledCardCommand(),
    setCardPresentation: (input: SetCardPresentationInput) => authoringEnabled
      ? setCardPresentationCommand(input.presentation)
      : disabledCardCommand(),
    setBlockHighlight: ({ color }: SetHighlightInput) => {
      validateHighlightColor(color)
      return semanticAction(updateClosestListAttrs(() => ({ blockHighlight: color, blockHighlightId: crypto.randomUUID() })), 'extract', onSemanticAction)
    },
    setInlineHighlight: ({ color }: SetHighlightInput) => {
      validateHighlightColor(color)
      return semanticAction(addMark({ type: 'inlineHighlight', attrs: { color, id: crypto.randomUUID() } satisfies InlineHighlightMarkAttrs }), 'extract', onSemanticAction)
    },
  })
}

export type CardExtension = Union<[
  CardSchemaExtension,
  CardCommandsExtension,
]>

export function defineCardExtension(options: CardExtensionOptions = {}): CardExtension {
  const createId = options.createId ?? defaultCreateId
  const authoringEnabled = options.authoringEnabled ?? true
  const addBasicCardShortcut = options.shortcuts?.addBasicCard ?? 'Alt+A'
  const highlightShortcut = options.shortcuts?.highlight ?? 'Alt+X'
  const addClozeShortcut = options.shortcuts?.addCloze ?? 'Alt+Z'
  return union(
    defineCardSchema(),
    ...(authoringEnabled ? [defineCardDelimiterNodeView()] : []),
    ...(authoringEnabled ? [definePrioritizedCardDelimiterUi()] : []),
    defineCardCommands(createId, authoringEnabled, options.onSemanticAction),
    withPriority(definePlugin(new Plugin({
      props: {
        handleKeyDown: (view, event) => {
          const command = event.key === ' '
            ? insertCardDelimiterFromTrigger(createId)
            : matchesKeyboardShortcut(event, addBasicCardShortcut)
              ? authoringEnabled ? insertCardDelimiter(createId, 'forward') : disabledCardCommand()
              : matchesKeyboardShortcut(event, highlightShortcut)
                ? semanticAction(toggleInlineHighlightCommand(), 'extract', options.onSemanticAction)
                : matchesKeyboardShortcut(event, addClozeShortcut)
                  ? authoringEnabled ? semanticAction(toggleClozeCommand(createId), 'cloze', options.onSemanticAction) : disabledCardCommand()
                  : null
          return command?.(view.state, view.dispatch, view) ?? false
        },
      },
    })), Priority.high),
    ...(authoringEnabled ? [defineCardInputRules(createId)] : []),
    ...(authoringEnabled ? [defineCardMembershipReconciler()] : []),
    ...(authoringEnabled
      ? [withPriority(defineKeymap({ Backspace: backspaceCardCommand(), Enter: enterCardCommand() }), Priority.highest)]
      : []),
  )
}
