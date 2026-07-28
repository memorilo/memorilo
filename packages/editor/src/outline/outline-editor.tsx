import type { MouseEvent as ReactMouseEvent } from 'react'
import type { EditorSession } from '../common/editor-session'
import type { OutlineOptions } from '../common/outline-runtime'
import * as stylex from '@stylexjs/stylex'
import { useLayoutEffect, useRef, useSyncExternalStore } from 'react'
import { EditorCanvas } from '../common/editor-canvas'
import { executeOutlineOutdent, outlineCommandBlockIds, outlineOutdentBlockedMessage, planOutlineOutdent } from '../common/outline-outdent'
import { outlineEditorStyles } from './outline-editor.stylex'
import { observeOutlineMarkerAlignment } from './outline-marker-alignment'

function visibleBlockIds(root: HTMLElement): string[] {
  return Array.from(root.querySelectorAll<HTMLElement>('[data-block-id]'))
    .filter(element => !element.hidden && element.getClientRects().length > 0)
    .map((element) => {
      const blockId = element.dataset.blockId
      if (!blockId)
        throw new Error('A visible outline block is missing its blockId')
      return blockId
    })
}

function focusLabel(root: HTMLElement | null, blockId: string | null): string | null {
  if (!root || !blockId)
    return null
  const element = root.querySelector<HTMLElement>(`[data-block-id="${CSS.escape(blockId)}"]`)
  const body = element?.querySelector<HTMLElement>(':scope > .list-content > :first-child')
  return body?.textContent?.trim() || blockId
}

export function OutlineEditor({ options, session }: { options?: OutlineOptions, session: EditorSession }) {
  const rootRef = useRef<HTMLDivElement>(null)
  const markerStylesRef = useRef<HTMLStyleElement>(null)
  const runtime = session.outlineRuntime
  const snapshot = useSyncExternalStore(runtime.subscribe, runtime.getSnapshot, runtime.getSnapshot)
  const commandBlockIds = outlineCommandBlockIds(session.editor.state, snapshot)
  const outdentPlan = planOutlineOutdent(session.editor.state, snapshot)
  const blockedMessage = outdentPlan.status === 'blocked' ? outlineOutdentBlockedMessage(outdentPlan.reason) : null
  const selectionBlockedMessage = snapshot.selectedBlockIds.length > 0 ? blockedMessage : null
  const statusMessage = snapshot.commandMessage
    ?? selectionBlockedMessage
    ?? (snapshot.selectedBlockIds.length > 0 ? `${snapshot.selectedBlockIds.length} blocks selected.` : 'Outline view ready.')
  const statusIsError = Boolean(snapshot.commandMessage || selectionBlockedMessage)

  useLayoutEffect(() => {
    const root = rootRef.current
    const markerStyles = markerStylesRef.current
    if (!root || !markerStyles)
      return
    return observeOutlineMarkerAlignment(root, markerStyles)
  }, [])

  const requestFocus = (blockId: string | null) => {
    const isControlled = Boolean(options && Object.prototype.hasOwnProperty.call(options, 'focus'))
    if (!isControlled)
      runtime.setFocus(blockId)
    options?.onFocusChange?.(blockId ? { blockId } : null)
  }

  const runOutdent = () => {
    executeOutlineOutdent(session.editor.state, session.editor.view.dispatch, runtime)
  }

  const handleMarkerClick = (event: ReactMouseEvent<HTMLDivElement>) => {
    const target = event.target
    if (!(target instanceof Element))
      return
    const marker = target.closest('.list-marker')
    if (!marker || !rootRef.current?.contains(marker))
      return
    const block = marker.parentElement
    if (!block)
      throw new Error('An outline marker is not attached to a stable block')
    const blockId = block.getAttribute('data-block-id')
    if (!blockId)
      throw new Error('An outline marker is attached to a block without a stable id')
    const listKind = block.getAttribute('data-list-kind')
    if (listKind === 'task' || listKind === 'toggle')
      return

    event.preventDefault()
    event.stopPropagation()
    if (event.altKey) {
      runtime.toggleCollapsed([blockId])
      return
    }
    if (event.metaKey || event.ctrlKey) {
      runtime.selectBlock(blockId, 'toggle', visibleBlockIds(rootRef.current))
      return
    }
    if (event.shiftKey) {
      runtime.selectBlock(blockId, 'range', visibleBlockIds(rootRef.current))
      return
    }
    requestFocus(blockId)
  }

  const collapseBlockIds = snapshot.selectedBlockIds.length > 0
    ? snapshot.selectedBlockIds
    : snapshot.focusBlockId ? [snapshot.focusBlockId] : commandBlockIds

  return (
    <div ref={rootRef} {...stylex.props(outlineEditorStyles.root)} onClickCapture={handleMarkerClick}>
      <style ref={markerStylesRef} data-outline-marker-alignment="" />
      <div {...stylex.props(outlineEditorStyles.toolbar)}>
        <div {...stylex.props(outlineEditorStyles.breadcrumbs)} aria-label="Outline location">
          {snapshot.focusBlockId
            ? (
                <>
                  <button {...stylex.props(outlineEditorStyles.button)} aria-label="Show all blocks" type="button" onClick={() => requestFocus(null)}>All blocks</button>
                  <span aria-hidden="true">/</span>
                  <span {...stylex.props(outlineEditorStyles.focusLabel)}>{focusLabel(rootRef.current, snapshot.focusBlockId) ?? snapshot.focusBlockId}</span>
                </>
              )
            : <span>All blocks</span>}
        </div>
        <div {...stylex.props(outlineEditorStyles.controls)}>
          {snapshot.selectedBlockIds.length > 0
            ? <button {...stylex.props(outlineEditorStyles.button)} type="button" onClick={() => runtime.clearSelection()}>Clear selection</button>
            : null}
          <button
            {...stylex.props(outlineEditorStyles.button)}
            disabled={collapseBlockIds.length === 0}
            type="button"
            onClick={() => runtime.toggleCollapsed(collapseBlockIds)}
          >
            Collapse / expand
          </button>
          <select
            {...stylex.props(outlineEditorStyles.select)}
            aria-label="Outdent behavior"
            value={snapshot.outdentBehavior}
            onChange={event => runtime.setOutdentBehavior(event.target.value === 'traditional' ? 'traditional' : 'logical')}
          >
            <option value="logical">Logical — move selected blocks only</option>
            <option value="traditional">Traditional — preserve visible order</option>
          </select>
          <button
            {...stylex.props(outlineEditorStyles.button)}
            aria-label="Outdent selected blocks"
            disabled={outdentPlan.status === 'blocked'}
            title={blockedMessage ?? 'Move selected blocks one level toward the root'}
            type="button"
            onClick={runOutdent}
          >
            Outdent
          </button>
        </div>
      </div>
      <div {...stylex.props(outlineEditorStyles.status, statusIsError && outlineEditorStyles.statusError)} aria-live="polite" role="status">
        {statusMessage}
      </div>
      <EditorCanvas session={session} />
    </div>
  )
}
