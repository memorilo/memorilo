import type { Extension, Union } from 'prosekit/core'
import type { Fragment, Node as ProseMirrorNode, ResolvedPos } from 'prosekit/pm/model'
import type { Command, EditorState, Transaction } from 'prosekit/pm/state'
import type { NodeViewConstructor } from 'prosekit/pm/view'
import type {
  CardAnswerPresentation,
  CardBlockAttrs,
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
  defineMarkSpec,
  defineNodeAttr,
  defineNodeSpec,
  defineNodeView,
  definePlugin,
  Priority,
  removeMark,
  union,
  withPriority,
} from 'prosekit/core'
import { defineInputRule } from 'prosekit/extensions/input-rule'
import { InputRule, undoInputRule } from 'prosekit/pm/inputrules'
import { NodeSelection, Plugin, PluginKey, TextSelection } from 'prosekit/pm/state'
import { Decoration, DecorationSet } from 'prosekit/pm/view'
import { createIndentListCommand, createSplitListCommand } from 'prosemirror-flat-list'
import { parseTaskHistory, pauseTask } from '../ui/task-list-view/task-status'

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

type CardDelimiterSpecExtension = Extension<{
  Nodes: {
    cardDelimiter: CardDelimiterAttrs
  }
}>

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

type ClozeSpecExtension = Extension<{
  Marks: {
    cloze: ClozeMarkAttrs
  }
}>

type InlineHighlightSpecExtension = Extension<{
  Marks: {
    inlineHighlight: InlineHighlightMarkAttrs
  }
}>

type CardBlockAttrsExtension = Extension<{
  Nodes: {
    list: CardBlockAttrs
  }
}>

interface CardDelimiterUiState {
  definitionId: string | null
  surface: CardDelimiterSurface | null
}

interface SetCardDelimiterUiState {
  definitionId: string | null
  surface: CardDelimiterSurface | null
}

export type CardDelimiterSurface = 'options' | 'preview'

const cardDelimiterUiKey = new PluginKey<CardDelimiterUiState>('card-delimiter-ui')

export function getSelectedCardDefinitionId(state: EditorState): string | null {
  const uiState = cardDelimiterUiKey.getState(state)
  if (!uiState)
    throw new Error('The Card UI plugin is missing from the editor state')
  return uiState.definitionId
}

export function getSelectedCardDelimiterPosition(state: EditorState): number | null {
  const definitionId = getSelectedCardDefinitionId(state)
  if (definitionId === null)
    return null
  return findCardDelimiterPositionByDefinitionId(state.doc, definitionId)
}

export function getSelectedCardDelimiterSurface(state: EditorState): CardDelimiterSurface | null {
  const uiState = cardDelimiterUiKey.getState(state)
  if (!uiState)
    throw new Error('The Card UI plugin is missing from the editor state')
  return uiState.surface
}

export function setSelectedCardDelimiterDefinitionId(
  transaction: Transaction,
  definitionId: string | null,
  surface: CardDelimiterSurface = 'options',
): Transaction {
  return transaction.setMeta(cardDelimiterUiKey, {
    definitionId,
    surface: definitionId === null ? null : surface,
  } satisfies SetCardDelimiterUiState)
}

function findCardDelimiterPositionByDefinitionId(
  document: ProseMirrorNode,
  definitionId: string,
): number | null {
  let position: number | null = null
  document.descendants((node, nodePosition) => {
    if (node.type.name !== 'cardDelimiter' || node.attrs.definitionId !== definitionId)
      return true
    if (position !== null)
      throw new Error(`Duplicate Card DefinitionID: ${definitionId}`)
    position = nodePosition
    return false
  })
  return position
}

function defaultCreateId(): string {
  return crypto.randomUUID()
}

function validateRequiredId(value: unknown): void {
  if (typeof value !== 'string' || value.length === 0)
    throw new TypeError('Card IDs must be non-empty strings')
}

function validateOptionalId(value: unknown): void {
  if (value !== null)
    validateRequiredId(value)
}

function validateDirection(value: unknown): void {
  if (value !== 'forward' && value !== 'backward' && value !== 'both' && value !== 'disabled')
    throw new TypeError(`Unsupported Card direction: ${String(value)}`)
}

function validateAnchorKind(value: unknown): void {
  if (value !== 'rich-content' && value !== 'math-source')
    throw new TypeError(`Unsupported Cloze anchor kind: ${String(value)}`)
}

function validateCardPresentation(value: unknown): void {
  if (value !== 'list' && value !== 'set')
    throw new TypeError(`Unsupported Card answer presentation: ${String(value)}`)
}

function validateHighlightColor(value: unknown): void {
  if (value !== 'yellow' && value !== 'green' && value !== 'blue' && value !== 'pink' && value !== 'orange' && value !== 'purple')
    throw new TypeError(`Unsupported Highlight color: ${String(value)}`)
}

function validateOptionalHighlightColor(value: unknown): void {
  if (value !== null)
    validateHighlightColor(value)
}

function directionSymbol(direction: CardDelimiterAttrs['direction']): string {
  if (direction === 'forward')
    return '→'
  if (direction === 'backward')
    return '←'
  if (direction === 'both')
    return '↔'
  return '—'
}

function createCardControlIcon(kind: CardDelimiterSurface): SVGSVGElement {
  const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  icon.setAttribute('aria-hidden', 'true')
  icon.setAttribute('fill', 'none')
  icon.setAttribute('height', '15')
  icon.setAttribute('stroke', 'currentColor')
  icon.setAttribute('stroke-linecap', 'round')
  icon.setAttribute('stroke-linejoin', 'round')
  icon.setAttribute('stroke-width', '1.8')
  icon.setAttribute('viewBox', '0 0 24 24')
  icon.setAttribute('width', '15')
  if (kind === 'preview') {
    const eye = document.createElementNS('http://www.w3.org/2000/svg', 'path')
    eye.setAttribute('d', 'M2.06 12s3.5-7 9.94-7 9.94 7 9.94 7-3.5 7-9.94 7S2.06 12 2.06 12Z')
    const pupil = document.createElementNS('http://www.w3.org/2000/svg', 'circle')
    pupil.setAttribute('cx', '12')
    pupil.setAttribute('cy', '12')
    pupil.setAttribute('r', '3')
    icon.append(eye, pupil)
    return icon
  }
  for (const pathData of ['M4 7h10', 'M18 7h2', 'M4 17h2', 'M10 17h10']) {
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'path')
    line.setAttribute('d', pathData)
    icon.append(line)
  }
  const knobs: Array<readonly [string, string]> = [['16', '7'], ['8', '17']]
  for (const [cx, cy] of knobs) {
    const knob = document.createElementNS('http://www.w3.org/2000/svg', 'circle')
    knob.setAttribute('cx', cx)
    knob.setAttribute('cy', cy)
    knob.setAttribute('r', '2')
    icon.append(knob)
  }
  return icon
}

function createCardControl(surface: CardDelimiterSurface, label: string): HTMLButtonElement {
  const button = document.createElement('button')
  button.type = 'button'
  button.dataset.cardControl = surface
  button.setAttribute('aria-label', label)
  button.append(createCardControlIcon(surface))
  return button
}

function defineCardDelimiterSpec(): CardDelimiterSpecExtension {
  return defineNodeSpec<'cardDelimiter', CardDelimiterAttrs>({
    name: 'cardDelimiter',
    atom: true,
    attrs: {
      backwardCardId: { default: null, validate: validateOptionalId },
      definitionId: { validate: validateRequiredId },
      direction: { validate: validateDirection },
      forwardCardId: { default: null, validate: validateOptionalId },
    },
    group: 'inline',
    inline: true,
    leafText: node => directionSymbol((node.attrs as CardDelimiterAttrs).direction),
    parseDOM: [{
      tag: 'span[data-card-delimiter]',
      getAttrs: (dom: HTMLElement) => {
        const definitionId = dom.dataset.cardDefinitionId
        const direction = dom.dataset.cardDirection
        if (!definitionId || !direction)
          return false
        validateDirection(direction)
        return {
          backwardCardId: dom.dataset.backwardCardId || null,
          definitionId,
          direction,
          forwardCardId: dom.dataset.forwardCardId || null,
        }
      },
    }],
    selectable: true,
    toDOM(node) {
      const attrs = node.attrs as CardDelimiterAttrs
      return ['span', {
        'data-backward-card-id': attrs.backwardCardId ?? '',
        'data-card-definition-id': attrs.definitionId,
        'data-card-delimiter': '',
        'data-card-direction': attrs.direction,
        'data-forward-card-id': attrs.forwardCardId ?? '',
      }, directionSymbol(attrs.direction)]
    },
  })
}

const createCardDelimiterView: NodeViewConstructor = (initialNode, view, getPos) => {
  const dom = document.createElement('span')
  dom.contentEditable = 'false'
  const symbol = document.createElement('span')
  symbol.dataset.cardDirectionSymbol = ''
  const controls = document.createElement('span')
  controls.dataset.cardHoverControls = ''
  controls.setAttribute('aria-label', 'Card controls')
  controls.setAttribute('role', 'group')

  const previewControl = createCardControl('preview', 'Preview card')
  const optionsControl = createCardControl('options', 'Card options')
  controls.append(previewControl, optionsControl)
  dom.append(symbol, controls)

  let node = initialNode
  const render = () => {
    const attrs = node.attrs as CardDelimiterAttrs
    dom.dataset.backwardCardId = attrs.backwardCardId ?? ''
    dom.dataset.cardDefinitionId = attrs.definitionId
    dom.dataset.cardDelimiter = ''
    dom.dataset.cardDirection = attrs.direction
    dom.dataset.forwardCardId = attrs.forwardCardId ?? ''
    symbol.textContent = directionSymbol(attrs.direction)
  }
  render()

  const openSurface = (surface: CardDelimiterSurface, event: MouseEvent) => {
    if (event.button !== 0)
      return
    event.preventDefault()
    event.stopPropagation()
    const position = getPos()
    if (typeof position !== 'number')
      return
    const currentNode = view.state.doc.nodeAt(position)
    if (!currentNode || currentNode.type.name !== 'cardDelimiter')
      throw new Error('Clicked Card delimiter does not map to its document node')
    const attrs = currentNode.attrs as CardDelimiterAttrs
    view.dispatch(setSelectedCardDelimiterDefinitionId(
      view.state.tr.setSelection(NodeSelection.create(view.state.doc, position)),
      attrs.definitionId,
      surface,
    ))
  }
  const preserveEditorSelection = (event: MouseEvent) => {
    event.preventDefault()
    event.stopPropagation()
  }
  const openPreview = (event: MouseEvent) => openSurface('preview', event)
  const openOptions = (event: MouseEvent) => openSurface('options', event)
  previewControl.addEventListener('mousedown', preserveEditorSelection)
  previewControl.addEventListener('click', openPreview)
  optionsControl.addEventListener('mousedown', preserveEditorSelection)
  optionsControl.addEventListener('click', openOptions)

  return {
    dom,
    update: (nextNode) => {
      if (nextNode.type !== node.type)
        return false
      node = nextNode
      render()
      return true
    },
    stopEvent: event => event.target instanceof Element && event.target.closest('[data-card-control]') !== null,
    destroy: () => {
      previewControl.removeEventListener('mousedown', preserveEditorSelection)
      previewControl.removeEventListener('click', openPreview)
      optionsControl.removeEventListener('mousedown', preserveEditorSelection)
      optionsControl.removeEventListener('click', openOptions)
    },
  }
}

function findMultilineCardDelimiterPositions(document: ProseMirrorNode): Set<number> {
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

interface CardSourceDefinition {
  definitionId: string
  hasCloze: boolean
  hasDelimiter: boolean
}

interface CardSourceScope {
  definitions: CardSourceDefinition[]
  position: number
}

function findCardSourceScopes(document: ProseMirrorNode): CardSourceScope[] {
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

function hasCardDefinition(document: ProseMirrorNode, definitionId: string): boolean {
  return findCardSourceScopes(document).some(scope => (
    scope.definitions.some(definition => definition.definitionId === definitionId)
  ))
}

function createClozePreviewControls(
  definitionId: string,
  active: boolean,
  rightOffset: number,
): (view: { state: EditorState, dispatch: (transaction: Transaction) => void }) => HTMLElement {
  return (view) => {
    const controls = document.createElement('span')
    controls.contentEditable = 'false'
    controls.dataset.cardHoverControls = ''
    controls.dataset.clozeCardControls = definitionId
    controls.style.right = `${rightOffset}px`
    if (active)
      controls.dataset.clozeCardControlsActive = ''
    controls.setAttribute('aria-label', 'Card controls')
    controls.setAttribute('role', 'group')
    const previewControl = createCardControl('preview', 'Preview card')
    const preserveEditorSelection = (event: MouseEvent) => {
      event.preventDefault()
      event.stopPropagation()
    }
    const openPreview = (event: MouseEvent) => {
      if (event.button !== 0)
        return
      event.preventDefault()
      event.stopPropagation()
      view.dispatch(setSelectedCardDelimiterDefinitionId(view.state.tr, definitionId, 'preview'))
    }
    previewControl.addEventListener('mousedown', preserveEditorSelection)
    previewControl.addEventListener('click', openPreview)
    controls.append(previewControl)
    return controls
  }
}

function defineCardDelimiterUi(): Extension {
  return definePlugin(new Plugin<CardDelimiterUiState>({
    key: cardDelimiterUiKey,
    state: {
      init: () => ({ definitionId: null, surface: null }),
      apply: (transaction, previous) => {
        const next = transaction.getMeta(cardDelimiterUiKey) as SetCardDelimiterUiState | undefined
        let definitionId = previous.definitionId
        let surface = previous.surface
        if (next) {
          definitionId = next.definitionId
          surface = next.surface
        }
        if (transaction.docChanged && definitionId !== null && !hasCardDefinition(transaction.doc, definitionId)) {
          definitionId = null
          surface = null
        }
        return { definitionId, surface }
      },
    },
    props: {
      decorations: (state) => {
        const uiState = cardDelimiterUiKey.getState(state)
        if (!uiState)
          throw new Error('The Card UI plugin is missing from the editor state')
        const selectedPosition = getSelectedCardDelimiterPosition(state)
        const selectedDefinitionId = uiState.definitionId
        const multilinePositions = findMultilineCardDelimiterPositions(state.doc)
        const decoratedPositions = new Set(multilinePositions)
        if (selectedPosition !== null)
          decoratedPositions.add(selectedPosition)

        const decorations = Array.from(decoratedPositions, (position) => {
          const node = state.doc.nodeAt(position)
          if (!node || node.type.name !== 'cardDelimiter')
            throw new Error(`Card delimiter decoration points to an invalid position: ${position}`)
          const classNames: string[] = []
          if (position === selectedPosition)
            classNames.push('card-delimiter-selected')
          if (multilinePositions.has(position))
            classNames.push('card-delimiter-multiline')
          return Decoration.node(position, position + node.nodeSize, { class: classNames.join(' ') })
        })

        for (const scope of findCardSourceScopes(state.doc)) {
          const node = state.doc.nodeAt(scope.position)
          if (!node || node.type.name !== 'list')
            throw new Error(`Card source scope points to an invalid position: ${scope.position}`)
          const definitionIds = scope.definitions.map(definition => definition.definitionId)
          const scopeIdentity = definitionIds.join(' ')
          const active = selectedDefinitionId !== null && definitionIds.includes(selectedDefinitionId)
          decorations.push(Decoration.node(scope.position, scope.position + node.nodeSize, {
            'data-card-definition-scope': scopeIdentity,
            ...(active ? { 'data-card-scope-active': '' } : {}),
          }))
          decorations.push(Decoration.widget(scope.position + 1, () => {
            const material = document.createElement('span')
            material.contentEditable = 'false'
            material.dataset.cardMaterial = scopeIdentity
            material.setAttribute('aria-hidden', 'true')
            return material
          }, {
            ignoreSelection: true,
            key: `card-material:${scope.position}:${scopeIdentity}`,
            side: -1,
            stopEvent: () => true,
          }))
          const delimiterControlOffset = scope.definitions.some(definition => definition.hasDelimiter) ? 64 : -6
          let clozeControlIndex = 0
          for (const definition of scope.definitions) {
            if (!definition.hasCloze)
              continue
            decorations.push(Decoration.widget(
              scope.position + 1,
              createClozePreviewControls(
                definition.definitionId,
                definition.definitionId === selectedDefinitionId,
                delimiterControlOffset + clozeControlIndex * 36,
              ),
              {
                ignoreSelection: true,
                key: `cloze-card-controls:${definition.definitionId}`,
                side: 1,
                stopEvent: event => event.target instanceof Element && event.target.closest('[data-card-control]') !== null,
              },
            ))
            clozeControlIndex += 1
          }
        }
        return DecorationSet.create(state.doc, decorations)
      },
      handleDOMEvents: {
        mousedown: (view, event) => {
          if (getSelectedCardDefinitionId(view.state) === null)
            return false
          const target = event.target
          if (target instanceof Element && target.closest('[data-card-delimiter], [data-cloze-card-controls]'))
            return false
          view.dispatch(setSelectedCardDelimiterDefinitionId(view.state.tr, null))
          return false
        },
      },
    },
  }))
}

function defineClozeSpec(): ClozeSpecExtension {
  return defineMarkSpec<'cloze', ClozeMarkAttrs>({
    name: 'cloze',
    attrs: {
      anchorKind: { validate: validateAnchorKind },
      cardId: { validate: validateRequiredId },
      definitionId: { validate: validateRequiredId },
      groupId: { validate: validateRequiredId },
    },
    inclusive: false,
    parseDOM: [{
      tag: 'span[data-cloze-group-id]',
      getAttrs: (dom: HTMLElement) => {
        const anchorKind = dom.dataset.clozeAnchorKind
        const cardId = dom.dataset.clozeCardId
        const definitionId = dom.dataset.clozeDefinitionId
        const groupId = dom.dataset.clozeGroupId
        if (!anchorKind || !cardId || !definitionId || !groupId)
          return false
        validateAnchorKind(anchorKind)
        return { anchorKind, cardId, definitionId, groupId }
      },
    }],
    toDOM(mark) {
      const attrs = mark.attrs as ClozeMarkAttrs
      return ['span', {
        'data-cloze-anchor-kind': attrs.anchorKind,
        'data-cloze-card-id': attrs.cardId,
        'data-cloze-definition-id': attrs.definitionId,
        'data-cloze-group-id': attrs.groupId,
      }, 0]
    },
  })
}

function defineInlineHighlightSpec(): InlineHighlightSpecExtension {
  return defineMarkSpec<'inlineHighlight', InlineHighlightMarkAttrs>({
    name: 'inlineHighlight',
    attrs: {
      color: { validate: validateHighlightColor },
    },
    parseDOM: [{
      tag: 'mark[data-inline-highlight]',
      getAttrs: (dom: HTMLElement) => {
        const color = dom.dataset.inlineHighlight
        if (!color)
          return false
        validateHighlightColor(color)
        return { color }
      },
    }],
    toDOM(mark) {
      const attrs = mark.attrs as InlineHighlightMarkAttrs
      return ['mark', { 'data-inline-highlight': attrs.color }, 0]
    },
  })
}

function defineCardBlockAttrs(): CardBlockAttrsExtension {
  return union(
    defineNodeAttr<'list', 'blockHighlight', HighlightColor | null>({
      type: 'list',
      attr: 'blockHighlight',
      default: null,
      splittable: false,
      validate: validateOptionalHighlightColor,
      toDOM: value => value ? ['data-block-highlight', value] : null,
      parseDOM: (element) => {
        const color = element.getAttribute('data-block-highlight')
        if (color === null)
          return null
        validateHighlightColor(color)
        return color as HighlightColor
      },
    }),
    defineNodeAttr<'list', 'cardItemDefinitionId', string | null>({
      type: 'list',
      attr: 'cardItemDefinitionId',
      default: null,
      splittable: true,
      validate: validateOptionalId,
      toDOM: value => value ? ['data-card-item-definition-id', value] : null,
      parseDOM: element => element.getAttribute('data-card-item-definition-id'),
    }),
  )
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

interface ListLocation {
  depth: number
  node: ProseMirrorNode
  position: number
}

interface CardDelimiterLocation {
  attrs: CardDelimiterAttrs
  node: ProseMirrorNode
  position: number
}

interface CardContext {
  delimiter: CardDelimiterLocation
  list: ListLocation
}

function readDelimiterNodeAttrs(node: ProseMirrorNode): CardDelimiterAttrs {
  if (node.type.name !== 'cardDelimiter')
    throw new TypeError(`Expected a Card delimiter, received ${node.type.name}`)
  const attrs = node.attrs as CardDelimiterAttrs
  validateRequiredId(attrs.definitionId)
  validateDirection(attrs.direction)
  validateOptionalId(attrs.forwardCardId)
  validateOptionalId(attrs.backwardCardId)
  return attrs
}

function findOwnCardDelimiter(
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

function listAncestors(state: EditorState): ListLocation[] {
  const ancestors: ListLocation[] = []
  const { $from } = state.selection
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const node = $from.node(depth)
    if (node.type.name === 'list')
      ancestors.push({ depth, node, position: $from.before(depth) })
  }
  return ancestors
}

function findCardContext(state: EditorState): CardContext | null {
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

function findDelimiterAtSelection(state: EditorState): CardDelimiterLocation | null {
  if (state.selection instanceof NodeSelection && state.selection.node.type.name === 'cardDelimiter') {
    const node = state.selection.node
    return { attrs: readDelimiterNodeAttrs(node), node, position: state.selection.from }
  }
  return findCardContext(state)?.delimiter ?? null
}

function directChildLists(list: ListLocation): Array<{ node: ProseMirrorNode, position: number }> {
  const children: Array<{ node: ProseMirrorNode, position: number }> = []
  list.node.forEach((child, offset) => {
    if (child.type.name === 'list')
      children.push({ node: child, position: list.position + 1 + offset })
  })
  return children
}

function matchingCardMembers(context: CardContext): Array<{ node: ProseMirrorNode, position: number }> {
  return directChildLists(context.list).filter(({ node }) => (
    node.attrs.cardItemDefinitionId === context.delimiter.attrs.definitionId
  ))
}

function firstDirectChildPosition(list: ListLocation): number {
  const firstChild = directChildLists(list)[0]
  return firstChild?.position ?? list.position + list.node.nodeSize - 1
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

function updateClosestListAttrs(resolveAttrs: (attrs: CardBlockAttrs) => Partial<CardBlockAttrs>): Command {
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

function createAnswerBlock(state: EditorState, delimiter: CardDelimiterLocation, contentFrom?: number): {
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
  const answer = createAnswerBlock(state, context.delimiter, answerContentFrom)
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

function setCardPresentation(input: SetCardPresentationInput, answerContentFrom?: number): Command {
  validateCardPresentation(input.presentation)
  return (state, dispatch) => {
    const context = findCardContext(state)
    if (!context)
      return false
    const members = matchingCardMembers(context)
    if (!dispatch)
      return true

    const transaction = state.tr
    if (members.length === 0) {
      const insertPosition = insertFirstCardMember(state, transaction, context, input.presentation, answerContentFrom)
      transaction.setSelection(TextSelection.near(transaction.doc.resolve(insertPosition + 2), 1))
    }
    else {
      for (const member of members) {
        const currentKind = member.node.attrs.kind
        if (typeof currentKind !== 'string' || currentKind.length === 0)
          throw new Error('Changing Card answer presentation requires a non-empty member Block kind')
        const kind = input.presentation === 'list'
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
const splitList = createSplitListCommand()

export function addBlockToCardBackCommand(): Command {
  return (state, dispatch, view) => {
    const current = listAncestors(state)[0]
    if (!current)
      return false
    const parentDepth = current.depth - 1
    const parent = state.selection.$from.node(parentDepth)
    const index = state.selection.$from.index(parentDepth)

    if (parent.type.name === 'list') {
      const parentLocation: ListLocation = {
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
    const previousLocation: ListLocation = {
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

function removeBlockFromCardBack(): Command {
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

    return setCardPresentation({ presentation: 'set' }, state.selection.from)(state, dispatch)
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
    const parentLocation: ListLocation = {
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

function enterCard(): Command {
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
    const sourceAnswer = createAnswerBlock(state, context.delimiter)
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

function backspaceCard(): Command {
  const collapseAnswer = collapseSingleSetAnswer()
  return (state, dispatch, view) => (
    undoInputRule(state, dispatch, view) || collapseAnswer(state, dispatch, view)
  )
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

function ownCardDefinitionIds(node: ProseMirrorNode): Set<string> {
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

function defineCardMembershipReconciler(): Extension {
  return definePlugin(new Plugin({
    appendTransaction: (transactions, _oldState, newState) => {
      if (!transactions.some(transaction => transaction.docChanged))
        return null
      const transaction = newState.tr
      const walk = (node: ProseMirrorNode, position: number): void => {
        const ownDefinitions = node.type.name === 'list' ? ownCardDefinitionIds(node) : new Set<string>()
        node.forEach((child, offset) => {
          const childPosition = position + 1 + offset
          if (child.type.name === 'list') {
            const memberDefinitionId = child.attrs.cardItemDefinitionId
            if (memberDefinitionId !== null && memberDefinitionId !== undefined) {
              validateRequiredId(memberDefinitionId)
              if (!ownDefinitions.has(memberDefinitionId)) {
                transaction.setNodeMarkup(childPosition, undefined, {
                  ...child.attrs,
                  cardItemDefinitionId: null,
                })
              }
            }
            walk(child, childPosition)
            return
          }
          walk(child, childPosition)
        })
      }
      newState.doc.forEach((child, offset) => {
        if (child.type.name === 'list') {
          const membership = child.attrs.cardItemDefinitionId
          if (membership !== null && membership !== undefined) {
            transaction.setNodeMarkup(offset, undefined, { ...child.attrs, cardItemDefinitionId: null })
          }
          walk(child, offset)
        }
        else {
          walk(child, offset)
        }
      })
      return transaction.docChanged ? transaction : null
    },
  }))
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
    removeBlockHighlight: () => updateClosestListAttrs(() => ({ blockHighlight: null })),
    removeCloze: () => removeMark({ type: 'cloze' }),
    removeBlockFromCardBack: () => removeBlockFromCardBack(),
    removeInlineHighlight: () => removeMark({ type: 'inlineHighlight' }),
    setCardDirection: (input: SetCardDirectionInput) => setCardDirection(createId, input),
    setCardPresentation: (input: SetCardPresentationInput) => setCardPresentation(input),
    setBlockHighlight: ({ color }: SetHighlightInput) => {
      validateHighlightColor(color)
      return updateClosestListAttrs(() => ({ blockHighlight: color }))
    },
    setInlineHighlight: ({ color }: SetHighlightInput) => {
      validateHighlightColor(color)
      return addMark({ type: 'inlineHighlight', attrs: { color } satisfies InlineHighlightMarkAttrs })
    },
  })
}

export type CardExtension = Union<[
  CardDelimiterSpecExtension,
  ClozeSpecExtension,
  InlineHighlightSpecExtension,
  CardBlockAttrsExtension,
  CardCommandsExtension,
]>

export function defineCardExtension(options: CardExtensionOptions = {}): CardExtension {
  const createId = options.createId ?? defaultCreateId
  return union(
    defineCardDelimiterSpec(),
    defineNodeView({ name: 'cardDelimiter', constructor: createCardDelimiterView }),
    withPriority(defineCardDelimiterUi(), Priority.highest),
    defineClozeSpec(),
    defineInlineHighlightSpec(),
    defineCardBlockAttrs(),
    defineCardCommands(createId),
    defineCardInputRules(createId),
    defineCardMembershipReconciler(),
    withPriority(defineKeymap({ Backspace: backspaceCard(), Enter: enterCard() }), Priority.highest),
  )
}
