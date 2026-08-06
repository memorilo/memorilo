import type { Extension } from 'prosekit/core'
import type { Mark, Node as ProseMirrorNode } from 'prosekit/pm/model'
import type { EditorView } from 'prosekit/pm/view'
import type { ClozeMarkAttrs, EditorCardProjection } from './card-model'
import type { CardReviewOptions, CardReviewRuntime } from './card-review-runtime'
import i18next from 'i18next'
import { CircleX, createElement as createLucideElement } from 'lucide'
import { definePlugin } from 'prosekit/core'
import { Plugin, PluginKey } from 'prosekit/pm/state'
import { Decoration, DecorationSet } from 'prosekit/pm/view'
import { renderKaTeXMathBlock, renderKaTeXMathInline } from '../sample/katex'

const cardReviewPluginKey = new PluginKey<number>('memorilo-card-review')

interface LocatedNode {
  node: ProseMirrorNode
  position: number
}

function readBlockId(node: ProseMirrorNode): string {
  const value = node.attrs.blockId
  if (typeof value !== 'string' || value.length === 0)
    throw new Error('Card review Blocks require stable BlockIDs')
  return value
}

function locateSourceBlock(document: ProseMirrorNode, sourceBlockId: string): LocatedNode {
  let result: LocatedNode | null = null
  document.descendants((node, position) => {
    if (node.type.name !== 'list' || readBlockId(node) !== sourceBlockId)
      return true
    if (result)
      throw new Error(`Duplicate Card source BlockID: ${sourceBlockId}`)
    result = { node, position }
    return false
  })
  if (!result)
    throw new Error(`Card source Block ${sourceBlockId} is missing from the Topic`)
  return result
}

function ownDescendants(
  parent: ProseMirrorNode,
  parentPosition: number,
  visit: (node: ProseMirrorNode, position: number) => boolean | void,
): void {
  parent.forEach((child, offset) => {
    if (child.type.name === 'list')
      return
    const childPosition = parentPosition + 1 + offset
    if (visit(child, childPosition) === false || child.isLeaf)
      return
    ownDescendants(child, childPosition, visit)
  })
}

function delimiterForCard(source: LocatedNode, card: Exclude<EditorCardProjection, { kind: 'cloze' }>): LocatedNode {
  let result: LocatedNode | null = null
  ownDescendants(source.node, source.position, (node, position) => {
    if (node.type.name !== 'cardDelimiter' || node.attrs.definitionId !== card.definitionId)
      return
    if (result)
      throw new Error(`Duplicate Card delimiter for definition ${card.definitionId}`)
    result = { node, position }
    return false
  })
  if (!result)
    throw new Error(`Card delimiter for definition ${card.definitionId} is missing from its source Block`)
  return result
}

function hideNode(node: ProseMirrorNode, position: number, decorations: Decoration[]): void {
  if (node.isText) {
    decorations.push(Decoration.inline(position, position + node.nodeSize, {
      'data-card-review-hidden': '',
    }))
    return
  }
  decorations.push(Decoration.node(position, position + node.nodeSize, {
    'data-card-review-hidden': '',
  }))
}

function isHiddenSide(
  node: ProseMirrorNode,
  position: number,
  delimiter: LocatedNode,
  hiddenSide: 'after' | 'before',
): boolean {
  const end = position + node.nodeSize
  return hiddenSide === 'before'
    ? end <= delimiter.position
    : position >= delimiter.position + delimiter.node.nodeSize
}

function hasVisibleSideContent(
  node: ProseMirrorNode,
  position: number,
  delimiter: LocatedNode,
  hiddenSide: 'after' | 'before',
): boolean {
  if (node.type.name === 'cardDelimiter')
    return true
  if (isHiddenSide(node, position, delimiter, hiddenSide))
    return false
  if (node.isLeaf || node.isText)
    return true

  let visible = false
  node.forEach((child, offset) => {
    if (child.type.name === 'list' || visible)
      return
    visible = hasVisibleSideContent(child, position + 1 + offset, delimiter, hiddenSide)
  })
  return visible
}

function decorateHiddenSide(
  source: LocatedNode,
  delimiter: LocatedNode,
  hiddenSide: 'after' | 'before',
  decorations: Decoration[],
): void {
  ownDescendants(source.node, source.position, (node, position) => {
    if (node.type.name === 'cardDelimiter')
      return false
    if (isHiddenSide(node, position, delimiter, hiddenSide)) {
      hideNode(node, position, decorations)
      return false
    }
    if (!hasVisibleSideContent(node, position, delimiter, hiddenSide)) {
      hideNode(node, position, decorations)
      return false
    }
  })
}

function readTargetCloze(mark: Mark, cardId: string): ClozeMarkAttrs | null {
  if (mark.type.name !== 'cloze' || mark.attrs.cardId !== cardId)
    return null
  const attrs = mark.attrs as ClozeMarkAttrs
  if (attrs.anchorKind !== 'math-source' && attrs.anchorKind !== 'rich-content')
    throw new TypeError(`Unsupported Card review Cloze anchor: ${String(attrs.anchorKind)}`)
  if (typeof attrs.definitionId !== 'string' || typeof attrs.groupId !== 'string')
    throw new TypeError('Card review Cloze identities must be strings')
  return attrs
}

function targetCloze(node: ProseMirrorNode, cardId: string): ClozeMarkAttrs | null {
  for (const mark of node.marks) {
    const attrs = readTargetCloze(mark, cardId)
    if (attrs)
      return attrs
  }
  return null
}

function hiddenAnswerWidget(kind: 'cloze' | 'item'): HTMLElement {
  const placeholder = document.createElement('span')
  placeholder.dataset.cardReviewPlaceholder = kind
  placeholder.setAttribute('aria-label', i18next.t(kind === 'cloze' ? 'ui.hiddenCloze' : 'ui.hiddenCardItem', { ns: 'editor' }))
  placeholder.textContent = '...'
  return placeholder
}

function mathMask(node: ProseMirrorNode, position: number, cardId: string): {
  hideWhole: boolean
  maskedSource: string
  sourceRanges: Array<{ from: number, to: number }>
} {
  const ownCloze = targetCloze(node, cardId)
  if (ownCloze?.anchorKind === 'math-source')
    throw new TypeError('MathSourceCloze must mark math source text, not the math node')
  let hideWhole = ownCloze?.anchorKind === 'rich-content'
  let maskedSource = ''
  const sourceRanges: Array<{ from: number, to: number }> = []
  node.forEach((child, offset) => {
    if (!child.isText)
      throw new TypeError('Card review math nodes may only contain text source')
    const childPosition = position + 1 + offset
    const cloze = targetCloze(child, cardId)
    if (cloze?.anchorKind === 'rich-content') {
      hideWhole = true
      maskedSource += child.text ?? ''
      return
    }
    if (cloze?.anchorKind === 'math-source') {
      maskedSource += '\\text{\\ldots}'
      sourceRanges.push({ from: childPosition, to: childPosition + child.nodeSize })
      return
    }
    maskedSource += child.text ?? ''
  })
  return { hideWhole, maskedSource, sourceRanges }
}

function decorateClozeQuestion(
  source: LocatedNode,
  cardId: string,
  decorations: Decoration[],
): void {
  ownDescendants(source.node, source.position, (node, position) => {
    if (node.type.name === 'mathInline' || node.type.name === 'mathBlock') {
      const mask = mathMask(node, position, cardId)
      if (mask.hideWhole) {
        hideNode(node, position, decorations)
        decorations.push(Decoration.widget(position, () => hiddenAnswerWidget('cloze'), {
          key: `card-review-cloze-math:${position}`,
          side: -1,
        }))
      }
      else {
        mask.sourceRanges.forEach(range => decorations.push(Decoration.inline(range.from, range.to, {
          'data-card-review-hidden': '',
        })))
      }
      return false
    }

    const cloze = targetCloze(node, cardId)
    if (!cloze)
      return
    if (cloze.anchorKind === 'math-source')
      throw new TypeError('MathSourceCloze must be contained by a math node')
    hideNode(node, position, decorations)
    decorations.push(Decoration.widget(position, () => hiddenAnswerWidget('cloze'), {
      key: `card-review-cloze:${position}`,
      side: -1,
    }))
    return false
  })
}

function createItemToggle(
  itemBlockId: string,
  label: string,
  selected: boolean,
  onToggle: (itemBlockId: string) => void,
): HTMLButtonElement {
  const button = document.createElement('button')
  button.type = 'button'
  button.dataset.cardReviewItemToggle = ''
  if (selected)
    button.dataset.cardReviewItemToggleSelected = ''
  button.setAttribute('aria-label', label)
  button.setAttribute('aria-pressed', String(selected))
  button.title = label
  const icon = createLucideElement(CircleX)
  icon.setAttribute('aria-hidden', 'true')
  icon.setAttribute('height', '17')
  icon.setAttribute('stroke-width', '1.8')
  icon.setAttribute('width', '17')
  button.append(icon)
  button.addEventListener('mousedown', event => event.preventDefault())
  button.addEventListener('click', (event) => {
    event.preventDefault()
    event.stopPropagation()
    onToggle(itemBlockId)
  })
  return button
}

function decorateCardMembers(
  source: LocatedNode,
  options: CardReviewOptions,
  decorations: Decoration[],
): void {
  const card = options.card
  const itemIds = card.kind === 'list' || card.kind === 'set'
    ? new Set(card.items.map(item => item.blockId))
    : new Set<string>()
  const foundItemIds = new Set<string>()
  const revealed = options.revealedItemBlockIds === undefined
    ? options.side === 'answer' ? itemIds : new Set<string>()
    : new Set(options.revealedItemBlockIds)
  const selected = new Set(options.itemSelection?.selectedItemBlockIds)

  const visitChildren = (parent: ProseMirrorNode, parentPosition: number, insideItem: boolean): void => {
    parent.forEach((child, offset) => {
      if (child.type.name !== 'list')
        return
      const position = parentPosition + 1 + offset
      const id = readBlockId(child)
      const isItem = itemIds.has(id)
      if (!insideItem && !isItem) {
        decorations.push(Decoration.node(position, position + child.nodeSize, {
          'data-card-review-unrelated': '',
          'hidden': '',
        }))
        return
      }

      if (isItem) {
        foundItemIds.add(id)
        if (child.attrs.cardItemDefinitionId !== card.definitionId)
          throw new Error(`Card member ${id} does not belong to definition ${card.definitionId}`)
        const itemRevealed = card.kind !== 'list' && card.kind !== 'set'
          ? true
          : card.direction === 'backward' || revealed.has(id)
        const attrs: Record<string, string> = { 'data-card-review-item': id }
        if (!itemRevealed)
          attrs['data-card-review-item-hidden'] = ''
        const itemSelected = selected.has(id)
        if (options.itemSelection && options.side === 'answer') {
          attrs['data-card-review-item-selectable'] = ''
          if (itemSelected)
            attrs['data-card-review-item-selected'] = ''
        }
        decorations.push(Decoration.node(position, position + child.nodeSize, attrs))

        if (!itemRevealed) {
          decorations.push(Decoration.widget(position + 1, () => hiddenAnswerWidget('item'), {
            key: `card-review-hidden-item:${id}`,
            side: -1,
          }))
        }
        else if (options.itemSelection && options.side === 'answer') {
          const label = options.itemSelection.label(id, itemSelected)
          const onToggle = options.itemSelection.onToggle
          decorations.push(Decoration.widget(position + 1, () => createItemToggle(id, label, itemSelected, onToggle), {
            key: `card-review-item-toggle:${id}:${itemSelected}:${label}`,
            side: -1,
            stopEvent: event => event.target instanceof Element && event.target.closest('[data-card-review-item-toggle]') !== null,
          }))
        }
      }
      visitChildren(child, position, insideItem || isItem)
    })
  }
  visitChildren(source.node, source.position, false)

  for (const itemId of itemIds) {
    if (!foundItemIds.has(itemId))
      throw new Error(`Card member ${itemId} is missing from source Block ${card.sourceBlockId}`)
  }
}

function createDecorations(document: ProseMirrorNode, options: CardReviewOptions): DecorationSet {
  if (!options.active)
    return DecorationSet.empty
  const source = locateSourceBlock(document, options.card.sourceBlockId)
  const card = options.card
  const sourceAttrs: Record<string, string> = {
    'data-card-review-card-kind': card.kind,
    'data-card-review-source': card.sourceBlockId,
  }
  if (card.kind !== 'cloze')
    sourceAttrs['data-card-review-card-direction'] = card.direction
  const decorations: Decoration[] = [
    Decoration.node(source.position, source.position + source.node.nodeSize, sourceAttrs),
  ]

  decorateCardMembers(source, options, decorations)
  if (options.side === 'question') {
    if (card.kind === 'cloze') {
      decorateClozeQuestion(source, card.id, decorations)
    }
    else {
      const delimiter = delimiterForCard(source, card)
      if (card.kind === 'basic' || card.direction === 'backward')
        decorateHiddenSide(source, delimiter, card.direction === 'backward' ? 'before' : 'after', decorations)
    }
  }
  return DecorationSet.create(document, decorations)
}

function syncMathDisplays(view: EditorView, options: CardReviewOptions): void {
  if (!options.active || options.card.kind !== 'cloze' || options.side === 'answer') {
    view.state.doc.descendants((node, position) => {
      if (node.type.name !== 'mathInline' && node.type.name !== 'mathBlock')
        return true
      const dom = view.nodeDOM(position)
      if (!(dom instanceof HTMLElement))
        throw new Error(`Card review math node at ${position} is missing its DOM element`)
      dom.removeAttribute('data-card-review-hidden')
      const display = dom.querySelector<HTMLElement>('.prosemirror-math-display')
      if (!display)
        throw new Error(`Card review math node at ${position} is missing its rendered display`)
      if (display.dataset.cardReviewMathSource === node.textContent)
        return false
      const render = node.type.name === 'mathBlock' ? renderKaTeXMathBlock : renderKaTeXMathInline
      render(node.textContent, display)
      display.dataset.cardReviewMathSource = node.textContent
      return false
    })
    return
  }

  const source = locateSourceBlock(view.state.doc, options.card.sourceBlockId)
  ownDescendants(source.node, source.position, (node, position) => {
    if (node.type.name !== 'mathInline' && node.type.name !== 'mathBlock')
      return
    const mask = mathMask(node, position, options.card.id)
    const dom = view.nodeDOM(position)
    if (!(dom instanceof HTMLElement))
      throw new Error(`Card review math node at ${position} is missing its DOM element`)
    dom.toggleAttribute('data-card-review-hidden', mask.hideWhole)
    const display = dom.querySelector<HTMLElement>('.prosemirror-math-display')
    if (!display)
      throw new Error(`Card review math node at ${position} is missing its rendered display`)
    if (display.dataset.cardReviewMathSource === mask.maskedSource)
      return false
    const render = node.type.name === 'mathBlock' ? renderKaTeXMathBlock : renderKaTeXMathInline
    render(mask.maskedSource, display)
    display.dataset.cardReviewMathSource = mask.maskedSource
    return false
  })
}

export function defineCardReviewExtension(runtime: CardReviewRuntime): Extension {
  return definePlugin(new Plugin<number>({
    key: cardReviewPluginKey,
    state: {
      init: () => 0,
      apply: (transaction, revision) => transaction.getMeta(cardReviewPluginKey) ? revision + 1 : revision,
    },
    props: {
      decorations: (state) => {
        cardReviewPluginKey.getState(state)
        return createDecorations(state.doc, runtime.getSnapshot())
      },
    },
    view: (view) => {
      const refresh = (): void => {
        if (!view.isDestroyed)
          view.dispatch(view.state.tr.setMeta(cardReviewPluginKey, true))
      }
      const unsubscribe = runtime.subscribe(refresh)
      i18next.on('languageChanged', refresh)
      syncMathDisplays(view, runtime.getSnapshot())
      return {
        destroy: () => {
          unsubscribe()
          i18next.off('languageChanged', refresh)
        },
        update: nextView => syncMathDisplays(nextView, runtime.getSnapshot()),
      }
    },
  }))
}
