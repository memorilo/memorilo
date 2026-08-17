'use client'

import type { VirtualElement } from '@floating-ui/react'
import type { Editor } from 'prosekit/core'
import type { CSSProperties } from 'react'
import type { CardExtension } from '../../card/card-extension'
import { autoUpdate, flip, FloatingPortal, offset, shift, useFloating } from '@floating-ui/react'
import * as stylex from '@stylexjs/stylex'
import { Brackets } from 'lucide-react'
import { TextSelection } from 'prosekit/pm/state'
import { useEditor, useEditorDerivedValue } from 'prosekit/react'
import { useEffect, useLayoutEffect, useReducer, useRef } from 'react'
import { useTranslation } from 'react-i18next'

import { floatingTransformOrigin } from '../floating-surface/floating-position'
import { mathClozeMenuStyles } from './math-cloze-menu.stylex'

type MathClozeKind = 'block' | 'inline'
type MathClozeSelectionKey = `${MathClozeKind}:${number}:${number}:${number}:${0 | 1}`

interface MathClozeSelection {
  clozeSelected: boolean
  from: number
  kind: MathClozeKind
  nodePosition: number
  to: number
}

function getMathClozeSelectionKey(editor: Editor<CardExtension>): MathClozeSelectionKey | null {
  const { $from, $to, empty, from, to } = editor.state.selection
  if (empty || $from.parent !== $to.parent)
    return null
  const nodeName = $from.parent.type.name
  if (nodeName !== 'mathInline' && nodeName !== 'mathBlock')
    return null
  const cloze = editor.state.schema.marks.cloze
  if (!cloze)
    throw new Error('Formula Cloze menu requires the Cloze mark schema')
  const kind = nodeName === 'mathBlock' ? 'block' : 'inline'
  const clozeSelected = editor.state.doc.rangeHasMark(from, to, cloze) ? 1 : 0
  return `${kind}:${$from.before()}:${from}:${to}:${clozeSelected}`
}

function parseMathClozeSelection(key: MathClozeSelectionKey | null): MathClozeSelection | null {
  if (!key)
    return null
  const [kindText, nodePositionText, fromText, toText, clozeSelectedText] = key.split(':')
  const kind: MathClozeKind | null = kindText === 'block' || kindText === 'inline' ? kindText : null
  const nodePosition = Number(nodePositionText)
  const from = Number(fromText)
  const to = Number(toText)
  if (!kind || !Number.isInteger(nodePosition) || !Number.isInteger(from) || !Number.isInteger(to))
    throw new Error(`Invalid formula Cloze selection key: ${key}`)
  return { clozeSelected: clozeSelectedText === '1', from, kind, nodePosition, to }
}

function restoreMathSelection(editor: Editor<CardExtension>, selected: MathClozeSelection): void {
  const { from, to } = editor.state.selection
  if (from === selected.from && to === selected.to)
    return
  const $from = editor.state.doc.resolve(selected.from)
  const $to = editor.state.doc.resolve(selected.to)
  const parentName = $from.parent.type.name
  if ($from.parent !== $to.parent
    || (parentName !== 'mathInline' && parentName !== 'mathBlock')
    || $from.before() !== selected.nodePosition) {
    throw new Error('Formula Cloze selection is no longer valid in the current document')
  }
  editor.view.dispatch(editor.state.tr.setSelection(
    TextSelection.create(editor.state.doc, selected.from, selected.to),
  ))
}

function blockFormulaReference(formula: HTMLElement): VirtualElement {
  return {
    contextElement: formula,
    getBoundingClientRect() {
      const rect = formula.getBoundingClientRect()
      return new DOMRect(rect.right - 6, rect.top + 6, 0, 0)
    },
  }
}

export default function MathClozeMenu() {
  const editor = useEditor<CardExtension>()
  const selectionKey = useEditorDerivedValue(getMathClozeSelectionKey)
  const retainedSelectionKey = useRef(selectionKey)
  const { t } = useTranslation('editor')
  const [, renderAfterDismissal] = useReducer(count => count + 1, 0)
  if (selectionKey)
    retainedSelectionKey.current = selectionKey
  const selected = parseMathClozeSelection(selectionKey ?? retainedSelectionKey.current)
  const selectedKind = selected?.kind ?? null
  const selectedNodePosition = selected?.nodePosition ?? null
  const {
    floatingStyles,
    isPositioned,
    placement,
    refs,
  } = useFloating({
    middleware: [
      offset(selectedKind === 'block' ? 0 : 6),
      flip({ padding: 12 }),
      shift({ padding: 12 }),
    ],
    open: selected !== null,
    placement: selectedKind === 'block' ? 'bottom-end' : 'right',
    strategy: 'fixed',
    transform: false,
    whileElementsMounted: autoUpdate,
  })

  useEffect(() => {
    if (selectionKey)
      return
    const timeout = window.setTimeout(() => {
      retainedSelectionKey.current = null
      renderAfterDismissal()
    }, 120)
    return () => window.clearTimeout(timeout)
  }, [selectionKey])

  useLayoutEffect(() => {
    if (!selectedKind || selectedNodePosition === null) {
      refs.setReference(null)
      return
    }
    const formula = editor.view.nodeDOM(selectedNodePosition)
    if (!(formula instanceof HTMLElement))
      throw new Error('Selected formula is missing its DOM element')
    refs.setReference(selectedKind === 'block' ? blockFormulaReference(formula) : formula)
  }, [editor, refs, selectedKind, selectedNodePosition])

  if (!selected)
    return null

  const run = () => {
    restoreMathSelection(editor, selected)
    const changed = selected.clozeSelected
      ? editor.commands.removeCloze()
      : editor.commands.addCloze({ anchorKind: 'math-source' })
    if (!changed)
      throw new Error('Formula Cloze action could not update the selected source')
  }
  const label = selected.clozeSelected
    ? t('ui.removeClozeFromFormula')
    : t('ui.createClozeFromFormula')
  const popupStyle: CSSProperties = {
    ...floatingStyles,
    '--math-cloze-transform-origin': floatingTransformOrigin(placement),
    'visibility': isPositioned ? 'visible' : 'hidden',
  } as CSSProperties

  return (
    <FloatingPortal>
      <div
        ref={refs.setFloating}
        {...stylex.props(mathClozeMenuStyles.toolbar)}
        aria-label={t('ui.formulaSelection')}
        data-math-cloze-kind={selected.kind}
        role="toolbar"
        style={popupStyle}
      >
        <button
          {...stylex.props(mathClozeMenuStyles.button)}
          aria-label={label}
          aria-pressed={selected.clozeSelected}
          type="button"
          onClick={run}
          onPointerDown={(event) => {
            event.preventDefault()
            event.stopPropagation()
            restoreMathSelection(editor, selected)
          }}
          onMouseDown={(event) => {
            event.preventDefault()
            event.stopPropagation()
          }}
        >
          <Brackets {...stylex.props(mathClozeMenuStyles.icon)} aria-hidden="true" size={14} strokeWidth={1.8} />
          <span>{selected.clozeSelected ? t('ui.removeCloze') : t('ui.cloze')}</span>
        </button>
      </div>
    </FloatingPortal>
  )
}
