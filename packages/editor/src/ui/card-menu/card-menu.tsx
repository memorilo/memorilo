'use client'

import type { Editor } from 'prosekit/core'
import type { CSSProperties } from 'react'
import type { CardExtension } from '../../card/card-extension'
import type { CardDelimiterAttrs, EditorCardProjection } from '../../card/card-model'
import * as stylex from '@stylexjs/stylex'
import { Eye, X } from 'lucide-react'
import { NodeSelection } from 'prosekit/pm/state'
import { useEditor, useEditorDerivedValue } from 'prosekit/react'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

import { useTranslation } from 'react-i18next'
import { getSelectedCardDefinitionId, getSelectedCardDelimiterPosition, getSelectedCardDelimiterSurface, setSelectedCardDelimiterDefinitionId } from '../../card/card-extension'
import { projectEditorCards } from '../../card/card-model'
import { CardPreview } from '../../card/card-preview'
import { floatingSurfaceStyles } from '../floating-surface/floating-surface.stylex'
import { cardMenuStyles } from './card-menu.stylex'

interface SelectedCardDelimiter {
  attrs: CardDelimiterAttrs
  position: number
  presentation: 'inline' | 'list' | 'set'
}

interface SelectedCard {
  cards: readonly EditorCardProjection[]
  definitionId: string
  delimiter: SelectedCardDelimiter | null
  surface: 'options' | 'preview'
}

interface MenuPosition {
  bottom?: number
  left: number
  maxHeight: number
  top?: number
}

function getSelectedCard(editor: Editor<CardExtension>): SelectedCard | null {
  const definitionId = getSelectedCardDefinitionId(editor.state)
  if (definitionId === null)
    return null
  const surface = getSelectedCardDelimiterSurface(editor.state)
  if (!surface)
    throw new Error('Selected Card is missing its UI surface')
  const cards = projectEditorCards(editor.state.doc.toJSON()).filter(card => card.definitionId === definitionId)
  if (cards.length === 0)
    throw new Error(`Selected Card ${definitionId} has no preview projection`)

  const position = getSelectedCardDelimiterPosition(editor.state)
  if (position === null) {
    if (surface !== 'preview')
      throw new Error(`Cloze Card ${definitionId} does not support Card options`)
    if (cards.some(card => card.kind !== 'cloze'))
      throw new Error(`Card ${definitionId} has no delimiter and is not a Cloze Card`)
    return { cards, definitionId, delimiter: null, surface }
  }
  const delimiter = editor.state.doc.nodeAt(position)
  if (!delimiter || delimiter.type.name !== 'cardDelimiter')
    throw new Error('Selected Card delimiter is missing from the document')
  const attrs = delimiter.attrs as CardDelimiterAttrs

  const $from = editor.state.doc.resolve(position)
  let presentation: SelectedCardDelimiter['presentation'] = 'inline'
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const node = $from.node(depth)
    if (node.type.name !== 'list')
      continue
    const memberKinds: unknown[] = []
    node.forEach((child) => {
      if (child.type.name === 'list' && child.attrs.cardItemDefinitionId === definitionId)
        memberKinds.push(child.attrs.kind)
    })
    if (memberKinds.length > 0)
      presentation = memberKinds.every(kind => kind === 'ordered') ? 'list' : 'set'
    break
  }
  return { cards, definitionId, delimiter: { attrs, position, presentation }, surface }
}

function CardMenuButton({
  children,
  label,
  onClick,
  selected,
}: {
  children: string
  label: string
  onClick: () => void
  selected: boolean
}) {
  return (
    <button
      {...stylex.props(cardMenuStyles.button, selected && cardMenuStyles.selected)}
      aria-label={label}
      aria-pressed={selected}
      type="button"
      onClick={onClick}
      onMouseDown={event => event.preventDefault()}
    >
      {children}
    </button>
  )
}

function preferredPreviewCard(selected: SelectedCard): EditorCardProjection {
  if (!selected.delimiter) {
    const clozeCards = selected.cards.filter(card => card.kind === 'cloze')
    if (clozeCards.length !== 1)
      throw new Error(`Cloze definition ${selected.definitionId} must project exactly one Card`)
    const card = clozeCards[0]
    if (!card)
      throw new Error(`Cloze definition ${selected.definitionId} has no Card projection`)
    return card
  }
  const preferredDirection = selected.delimiter.attrs.direction === 'backward' ? 'backward' : 'forward'
  const card = selected.cards.find(candidate => candidate.kind !== 'cloze' && candidate.direction === preferredDirection)
  if (!card)
    throw new Error(`Card ${selected.definitionId} has no ${preferredDirection} preview projection`)
  return card
}

function getCardTrigger(editor: Editor<CardExtension>, selected: SelectedCard): HTMLElement {
  if (selected.delimiter) {
    const node = editor.view.nodeDOM(selected.delimiter.position)
    if (!(node instanceof HTMLElement))
      throw new Error('Selected Card delimiter is missing its DOM element')
    const trigger = node.querySelector(`[data-card-control="${selected.surface}"]`)
    if (!(trigger instanceof HTMLElement))
      throw new Error(`Selected Card is missing its ${selected.surface} control`)
    return trigger
  }
  const controls = editor.view.dom.querySelector(`[data-cloze-card-controls="${CSS.escape(selected.definitionId)}"]`)
  if (!(controls instanceof HTMLElement))
    throw new Error(`Selected Cloze Card ${selected.definitionId} is missing its controls`)
  const trigger = controls.querySelector('[data-card-control="preview"]')
  if (!(trigger instanceof HTMLElement))
    throw new Error(`Selected Cloze Card ${selected.definitionId} is missing its Preview control`)
  return trigger
}

export default function CardMenu() {
  const editor = useEditor<CardExtension>()
  const selected = useEditorDerivedValue(getSelectedCard)
  const popupRef = useRef<HTMLDivElement>(null)
  const { t } = useTranslation('editor')
  const [position, setPosition] = useState<MenuPosition | null>(null)
  const [previewState, setPreviewState] = useState<{ cardId: string, definitionId: string } | null>(null)

  const selectedDefinitionId = selected?.definitionId ?? null
  const previewOpen = selected?.surface === 'preview'
  const previewCardId = previewOpen
    ? previewState?.definitionId === selectedDefinitionId
      ? previewState.cardId
      : selected ? preferredPreviewCard(selected).id : null
    : null

  useLayoutEffect(() => {
    if (!selected) {
      setPosition(null)
      return
    }
    const update = () => {
      const trigger = getCardTrigger(editor, selected)
      const rect = trigger.getBoundingClientRect()
      const viewportPadding = 12
      const popupWidth = Math.min(previewOpen ? 440 : 240, window.innerWidth - viewportPadding * 2)
      const left = Math.max(
        viewportPadding + popupWidth / 2,
        Math.min(rect.left + rect.width / 2, window.innerWidth - viewportPadding - popupWidth / 2),
      )
      const spaceBelow = window.innerHeight - rect.bottom
      const spaceAbove = rect.top
      const placeBelow = spaceBelow >= (previewOpen ? 360 : 132) || spaceBelow >= spaceAbove
      setPosition(placeBelow
        ? { left, maxHeight: Math.max(48, spaceBelow - 22), top: rect.bottom + 10 }
        : { bottom: window.innerHeight - rect.top + 10, left, maxHeight: Math.max(48, spaceAbove - 22) })
    }
    update()
    window.addEventListener('resize', update)
    document.addEventListener('scroll', update, true)
    return () => {
      window.removeEventListener('resize', update)
      document.removeEventListener('scroll', update, true)
    }
  }, [editor, previewOpen, selected])

  useEffect(() => {
    if (!previewOpen || !selected)
      return

    const dismiss = (restoreFocus: boolean) => {
      setPreviewState(null)
      editor.view.dispatch(setSelectedCardDelimiterDefinitionId(editor.state.tr, null))
      if (restoreFocus)
        editor.view.focus()
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape')
        return
      event.preventDefault()
      dismiss(true)
    }
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target
      if (!(target instanceof Node))
        return
      const trigger = getCardTrigger(editor, selected)
      const controls = trigger.closest('[data-card-hover-controls]')
      if (popupRef.current?.contains(target) || (controls instanceof Node && controls.contains(target)))
        return
      dismiss(false)
    }
    document.addEventListener('keydown', handleKeyDown)
    document.addEventListener('pointerdown', handlePointerDown, true)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.removeEventListener('pointerdown', handlePointerDown, true)
    }
  }, [editor, previewOpen, selected])

  if (!selected || !position)
    return null

  const popupStyle: CSSProperties = {
    bottom: position.bottom,
    left: position.left,
    maxHeight: position.maxHeight,
    top: position.top,
    transform: 'translateX(-50%)',
  }

  const prepareCommand = () => {
    if (!selected.delimiter)
      throw new Error(`Cloze Card ${selected.definitionId} does not support delimiter commands`)
    const node = editor.state.doc.nodeAt(selected.delimiter.position)
    if (!node || node.type.name !== 'cardDelimiter')
      throw new Error('Selected Card delimiter is missing from the document')
    editor.view.dispatch(setSelectedCardDelimiterDefinitionId(
      editor.state.tr.setSelection(NodeSelection.create(editor.state.doc, selected.delimiter.position)),
      selected.definitionId,
      'options',
    ))
  }

  const runDirectionCommand = (direction: CardDelimiterAttrs['direction']) => {
    prepareCommand()
    editor.commands.setCardDirection({ direction })
  }

  const runPresentationCommand = (presentation: 'list' | 'set') => {
    prepareCommand()
    editor.commands.setCardPresentation({ presentation })
    editor.view.dispatch(setSelectedCardDelimiterDefinitionId(editor.state.tr, null))
  }

  const closePreview = () => {
    setPreviewState(null)
    editor.view.dispatch(setSelectedCardDelimiterDefinitionId(editor.state.tr, null))
    editor.view.focus()
  }

  if (previewOpen) {
    const card = selected.cards.find(candidate => candidate.id === previewCardId)
    if (!card)
      throw new Error(`Preview CardID ${previewCardId} is missing from definition ${selected.definitionId}`)
    const directionalCards = selected.cards.filter((candidate): candidate is Exclude<EditorCardProjection, { kind: 'cloze' }> => candidate.kind !== 'cloze')

    return createPortal(
      <div
        ref={popupRef}
        {...stylex.props(floatingSurfaceStyles.motion, floatingSurfaceStyles.surface, cardMenuStyles.previewPopup)}
        aria-label={t('ui.cardPreview')}
        aria-modal="false"
        role="dialog"
        style={popupStyle}
      >
        <div {...stylex.props(cardMenuStyles.previewHeader)}>
          <div {...stylex.props(cardMenuStyles.previewTitle)}>
            <Eye aria-hidden="true" size={15} strokeWidth={1.8} />
            <span>{t('ui.preview')}</span>
          </div>
          <button
            {...stylex.props(cardMenuStyles.iconButton)}
            aria-label={t('ui.closePreview')}
            type="button"
            onClick={closePreview}
            onMouseDown={event => event.preventDefault()}
          >
            <X aria-hidden="true" size={16} strokeWidth={1.8} />
          </button>
        </div>
        {directionalCards.length > 1
          ? (
              <div {...stylex.props(cardMenuStyles.previewDirection)} aria-label={t('ui.previewDirection')} role="group">
                {directionalCards.map(candidate => (
                  <CardMenuButton
                    key={candidate.id}
                    label={candidate.direction === 'forward' ? t('ui.previewForwardCard') : t('ui.previewReverseCard')}
                    selected={candidate.id === card.id}
                    onClick={() => setPreviewState({ cardId: candidate.id, definitionId: selected.definitionId })}
                  >
                    {candidate.direction === 'forward' ? t('ui.questionToAnswer') : t('ui.answerToQuestion')}
                  </CardMenuButton>
                ))}
              </div>
            )
          : null}
        <div {...stylex.props(cardMenuStyles.previewBody)}>
          <CardPreview appearance="embedded" card={card} />
        </div>
      </div>,
      document.body,
    )
  }

  if (!selected.delimiter)
    throw new Error(`Cloze Card ${selected.definitionId} cannot open Card options`)

  return createPortal(
    <div
      ref={popupRef}
      {...stylex.props(floatingSurfaceStyles.motion, floatingSurfaceStyles.surface, cardMenuStyles.popup)}
      aria-label={t('ui.cardOptions')}
      role="toolbar"
      style={popupStyle}
    >
      <div {...stylex.props(cardMenuStyles.row)}>
        <span {...stylex.props(cardMenuStyles.label)}>{t('ui.direction')}</span>
        <div {...stylex.props(cardMenuStyles.group)} aria-label={t('ui.cardDirection')} role="group">
          <CardMenuButton label={t('ui.basicDirection')} selected={selected.delimiter.attrs.direction === 'forward'} onClick={() => runDirectionCommand('forward')}>→</CardMenuButton>
          <CardMenuButton label={t('ui.reverseDirection')} selected={selected.delimiter.attrs.direction === 'backward'} onClick={() => runDirectionCommand('backward')}>←</CardMenuButton>
          <CardMenuButton label={t('ui.bidirectional')} selected={selected.delimiter.attrs.direction === 'both'} onClick={() => runDirectionCommand('both')}>↔</CardMenuButton>
        </div>
      </div>
      <div {...stylex.props(cardMenuStyles.row)}>
        <span {...stylex.props(cardMenuStyles.label)}>{t('ui.multiLine')}</span>
        <div {...stylex.props(cardMenuStyles.group)} aria-label={t('ui.cardAnswerPresentation')} role="group">
          <CardMenuButton label={t('ui.setAnswer')} selected={selected.delimiter.presentation === 'set'} onClick={() => runPresentationCommand('set')}>{t('ui.set')}</CardMenuButton>
          <CardMenuButton label={t('ui.listAnswer')} selected={selected.delimiter.presentation === 'list'} onClick={() => runPresentationCommand('list')}>{t('ui.list')}</CardMenuButton>
        </div>
      </div>
    </div>,
    document.body,
  )
}
