import type { Extension } from 'prosekit/core'
import type { Node as ProseMirrorNode } from 'prosekit/pm/model'
import type { EditorState, Transaction } from 'prosekit/pm/state'
import type { NodeViewConstructor } from 'prosekit/pm/view'
import type { CardDelimiterAttrs } from './card-model'
import i18next from 'i18next'
import { defineNodeView, definePlugin, Priority, withPriority } from 'prosekit/core'
import { NodeSelection, Plugin, PluginKey } from 'prosekit/pm/state'
import { Decoration, DecorationSet } from 'prosekit/pm/view'
import { directionSymbol } from '../schema/card-schema'
import {
  findCardSourceScopes,
  findMultilineCardDelimiterPositions,
  hasCardDefinition,
} from './card-tree'

export type CardDelimiterSurface = 'options' | 'preview'

interface CardDelimiterUiState {
  definitionId: string | null
  surface: CardDelimiterSurface | null
}

interface SetCardDelimiterUiState {
  definitionId: string | null
  surface: CardDelimiterSurface | null
}

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

export const createCardDelimiterView: NodeViewConstructor = (initialNode, view, getPos) => {
  const dom = document.createElement('span')
  dom.contentEditable = 'false'
  const symbol = document.createElement('span')
  symbol.dataset.cardDirectionSymbol = ''
  const controls = document.createElement('span')
  controls.dataset.cardHoverControls = ''
  controls.setAttribute('aria-label', i18next.t('ui.cardControls', { ns: 'editor' }))
  controls.setAttribute('role', 'group')

  const previewControl = createCardControl('preview', i18next.t('ui.previewCard', { ns: 'editor' }))
  const optionsControl = createCardControl('options', i18next.t('ui.cardOptions', { ns: 'editor' }))
  controls.append(previewControl, optionsControl)
  dom.append(symbol, controls)

  const renderTranslations = () => {
    controls.setAttribute('aria-label', i18next.t('ui.cardControls', { ns: 'editor' }))
    previewControl.setAttribute('aria-label', i18next.t('ui.previewCard', { ns: 'editor' }))
    optionsControl.setAttribute('aria-label', i18next.t('ui.cardOptions', { ns: 'editor' }))
  }
  i18next.on('languageChanged', renderTranslations)

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
      i18next.off('languageChanged', renderTranslations)
      previewControl.removeEventListener('mousedown', preserveEditorSelection)
      previewControl.removeEventListener('click', openPreview)
      optionsControl.removeEventListener('mousedown', preserveEditorSelection)
      optionsControl.removeEventListener('click', openOptions)
    },
  }
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
    controls.setAttribute('aria-label', i18next.t('ui.cardControls', { ns: 'editor' }))
    controls.setAttribute('role', 'group')
    const previewControl = createCardControl('preview', i18next.t('ui.previewCard', { ns: 'editor' }))
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

export function defineCardDelimiterUi(): Extension {
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
                key: `cloze-card-controls:${definition.definitionId}:${i18next.resolvedLanguage}`,
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

export function defineCardDelimiterNodeView(): Extension {
  return defineNodeView({ name: 'cardDelimiter', constructor: createCardDelimiterView })
}

export function definePrioritizedCardDelimiterUi(): Extension {
  return withPriority(defineCardDelimiterUi(), Priority.highest)
}
